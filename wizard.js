// Pure qualification logic — severity order: stop > escalate > warn > ok.
// selections: [{ materialId, size }]; roofConfig: see DEFAULT_ROOF_CONFIG.
function evaluateRoof(selections, roofConfig) {
  const SEV = { stop: 3, escalate: 2, warn: 1, ok: 0 };
  const result = {
    outcome: 'ok', flags: [], stopReason: '', stopScript: '',
    escalateNote: '', perMaterial: [],
  };
  let worst = 'ok';
  const bump = (outcome, msg, reasons) => {
    if (SEV[outcome] > SEV[worst]) worst = outcome;
    if (outcome === 'warn' && msg) result.flags.push(msg);
    if (outcome === 'stop' && reasons) {
      result.stopReason = reasons.stopReason || result.stopReason;
      result.stopScript = reasons.stopScript || result.stopScript;
    }
    if (outcome === 'escalate' && reasons && reasons.escalateNote) {
      result.escalateNote = reasons.escalateNote;
    }
  };

  // 1) total-size rule (sum of all material areas)
  const sum = selections.reduce((a, s) => a + (parseInt(s.size) || 0), 0);
  const th = roofConfig.totalSizeThresholds;
  if (sum < th.borderline) {
    bump('stop', null, {
      stopReason: `שטח גג כולל ${sum} מ"ר — קטן מדי להתקנה (מינימום ${th.borderline} מ"ר)`,
      stopScript: `לצערנו שטח הגג לא מספיק גדול להתקנה. נדרש לפחות ${th.borderline} מ"ר.`,
    });
  } else if (sum < th.good) {
    bump('warn', `שטח גג כולל ${sum} מ"ר — גבולי. המומחה יאשר התאמה`);
  }

  // 2) per-material base action + size rules
  for (const sel of selections) {
    const mat = roofConfig.materials.find(m => m.id === sel.materialId);
    if (!mat) continue;
    const size = parseInt(sel.size) || 0;
    let matOutcome = 'ok';
    let matMsg = '';

    // base action (size-independent). 'tiles-age' is a flow trigger, not a severity.
    if (mat.baseAction === 'stop') { bump('stop', null, mat.messages); matOutcome = 'stop'; }
    else if (mat.baseAction === 'escalate') { bump('escalate', null, mat.messages); matOutcome = 'escalate'; }
    else if (mat.baseAction === 'flag') { bump('warn', mat.messages.flagMsg); matOutcome = 'warn'; matMsg = mat.messages.flagMsg; }

    // size rules (first rule whose upTo >= size; upTo:null = catch-all)
    const rule = (mat.sizeRules || []).find(r => r.upTo === null || size <= r.upTo);
    if (rule && rule.outcome !== 'ok') {
      bump(rule.outcome, rule.message, { stopReason: rule.message, stopScript: '' });
      if (SEV[rule.outcome] > SEV[matOutcome]) { matOutcome = rule.outcome; matMsg = rule.message; }
    }

    result.perMaterial.push({ id: mat.id, label: mat.label, size, outcome: matOutcome, message: matMsg });
  }

  result.outcome = worst;
  return result;
}

// ============================================================
// WIZARD STATE MACHINE
// ============================================================
const Wizard = (() => {
  // State
  let state = {
    step: 0,
    answers: [],
    flags: [],
    outcome: null,
    stopReason: '',
    stopScript: '',
    escalateNote: '',
    followUpNote: '',
    selectedRoofTypes: [],
  };

  // roofConfig is the single source of truth for materials/thresholds.
  // Falls back to safe defaults if config.js failed to define it.
  const roofConfig = (typeof DEFAULT_ROOF_CONFIG !== 'undefined')
    ? DEFAULT_ROOF_CONFIG
    : { materials: [], totalSizeThresholds: { good: 70, borderline: 60 }, tilesAgeWarning: 25 };

  // Build roof-type multi-select options from the materials list. Message
  // fields are flattened to the top level for the existing confirm flow.
  function roofTypeOptions() {
    return roofConfig.materials.map(m => ({
      label: `${m.emoji} ${m.label}`,
      value: m.id,
      flagClass: m.baseFlagClass,
      action: m.baseAction, // null|'flag'|'escalate'|'stop'|'tiles-age'
      flagMsg: m.messages.flagMsg,
      escalateNote: m.messages.escalateNote,
      stopReason: m.messages.stopReason,
      stopScript: m.messages.stopScript,
    }));
  }

  const QUESTIONS = [
    {
      id: 'property-type',
      text: 'מה סוג הנכס?',
      hint: 'דירה בבניין משותף — בדרך כלל לא מתאימה',
      type: 'buttons',
      options: [
        { label: '🏠 בית פרטי / דו-משפחתי', value: 'private', flagClass: 'ok', action: null },
        { label: '🏢 קונדו בבעלות פרטית', value: 'condo-private', flagClass: 'warn',
          action: 'flag', flagMsg: 'קונדו בבעלות פרטית — יש לוודא שיש גישה לגג' },
        { label: '🏗 קונדו בבעלות משותפת', value: 'condo-shared', flagClass: 'bad',
          action: 'stop',
          stopReason: 'קונדו בבעלות משותפת — לא מתאים להתקנה',
          stopScript: 'אנחנו מתקינים על בתים פרטיים — בבניין משותף יש מגבלות רגולטוריות שמונעות זאת כרגע.' },
      ],
    },
    {
      id: 'ownership',
      text: 'האם הנכס בבעלות הלקוח?',
      hint: 'שוכרים אינם יכולים לחתום על חוזה התקנה',
      type: 'buttons',
      options: [
        { label: '✅ כן, בבעלותי', value: 'yes', flagClass: 'ok', action: null },
        { label: '❌ לא, שכירות', value: 'no', flagClass: 'bad',
          action: 'stop',
          stopReason: 'הנכס אינו בבעלות הלקוח',
          stopScript: 'כדי להתקין מערכת סולארית חייבים להיות הבעלים של הנכס. בהצלחה!' },
      ],
    },
    {
      id: 'permit',
      text: 'האם יש טופס 4 / היתר בניה לנכס?',
      hint: 'ללא טופס 4 לא ניתן לחבר מערכת לרשת החשמל',
      type: 'buttons',
      options: [
        { label: '✅ יש טופס 4', value: 'yes', flagClass: 'ok', action: null },
        { label: '⏳ בהמשך / בתהליך', value: 'pending', flagClass: 'warn',
          action: 'follow-up',
          followUpNote: 'הסבר ללקוח: חיבור לרשת דורש טופס 4 בתוקף. אפשרויות: (א) לקבוע פולואפ לתאריך שהטופס צפוי. (ב) אם רוצה תכנון ראשוני כבר עכשיו — להעביר ל-VSD.' },
        { label: '❌ אין', value: 'no', flagClass: 'bad',
          action: 'follow-up',
          followUpNote: 'הסבר ללקוח: חיבור לרשת דורש טופס 4 בתוקף. אפשרויות: (א) לקבוע פולואפ לתאריך שהטופס צפוי. (ב) אם רוצה תכנון ראשוני כבר עכשיו — להעביר ל-VSD.' },
      ],
    },
    {
      id: 'connection',
      text: 'חיבור לחברת חשמל?',
      hint: 'חיבור זמני = לא ניתן להתקין',
      type: 'buttons',
      options: [
        { label: '✅ חיבור קבע', value: 'permanent', flagClass: 'ok', action: null },
        { label: '❌ חיבור זמני / אין', value: 'no', flagClass: 'bad',
          action: 'stop',
          stopReason: 'אין חיבור קבע לחברת חשמל',
          stopScript: 'להתקנה נדרש חיבור קבע לחברת חשמל. ניתן לחזור אלינו לאחר שהחיבור הוסדר.' },
      ],
    },
    {
      id: 'meter',
      text: 'היכן נמצא מונה החשמל?',
      hint: 'מונה בתוך הבית מצריך שדרוג למונה חכם',
      type: 'buttons',
      options: [
        { label: '✅ מחוץ לבית', value: 'outside', flagClass: 'ok', action: null },
        { label: '⚠️ בתוך הבית', value: 'inside', flagClass: 'warn',
          action: 'flag',
          flagMsg: 'מונה חשמל בתוך הבית — יידרש מונה חכם. הלקוח הסכים להמשיך.' },
      ],
    },
    {
      id: 'roof-type',
      text: 'מה סוג/י הגג?',
      hint: 'אפשר לבחור כמה חלקים — לדוגמה פרגולה + בטון שטוח',
      type: 'roof-grid-multi',
      get options() { return roofTypeOptions(); },
    },
    {
      id: 'tiles-age',
      text: 'מה גיל גג הרעפים (שנים)?',
      hint: 'גג ישן מעל 25 שנה דורש בדיקת חוזק — המומחה יאשר',
      type: 'buttons',
      options: [
        { label: '📅 עד 25 שנה', value: 'young', flagClass: 'ok', action: null },
        { label: '📅 מעל 25 שנה', value: 'old', flagClass: 'warn',
          action: 'flag', flagMsg: 'גג רעפים מעל 25 שנה — המומחה יבדוק חוזק הגג' },
        { label: '❓ לא יודע', value: 'unknown', flagClass: 'warn',
          action: 'flag', flagMsg: 'גיל גג רעפים לא ידוע — המומחה יבדוק' },
      ],
    },
    {
      id: 'material-sizes',
      text: 'מה השטח המשוער של כל חלק בגג?',
      hint: 'ניתן לתת הערכה גסה לכל חומר — סכום השטחים יחושב אוטומטית.',
      type: 'material-sizes',
      options: [],
    },
    {
      id: 'roof-orientation',
      text: 'לאיזה כיוון פונה מדרון הגג העיקרי?',
      hint: 'סובב את המחוג לכיוון שאליו משופע הגג. דרום = תפוקה מיטבית בישראל.',
      type: 'compass',
      options: [],
    },
    {
      id: 'shading',
      text: 'האם יש הצללות על הגג?',
      hint: 'עצים, מבנים שכנים, מיתקנים על הגג',
      type: 'buttons',
      options: [
        { label: '☀️ אין הצללות', value: 'none', flagClass: 'ok', action: null },
        { label: '🌤 הצללה חלקית', value: 'partial', flagClass: 'warn',
          action: 'flag', flagMsg: 'הצללה חלקית על הגג — המומחה יעריך השפעה על יעילות' },
        { label: '🌥 הצללה משמעותית', value: 'heavy', flagClass: 'bad',
          action: 'escalate',
          escalateNote: 'הצללה משמעותית — יש לדון עם מנהל לפני קידום' },
      ],
    },
  ];

  const MAIN_FLOW = ['property-type','ownership','permit','connection','meter','roof-type','material-sizes','roof-orientation','shading'];

  function getQuestion(id) {
    return QUESTIONS.find(q => q.id === id);
  }

  function reset() {
    state = { step: 0, answers: [], flags: [], outcome: null, stopReason: '', stopScript: '', escalateNote: '', followUpNote: '', selectedRoofTypes: [] };
  }

  function buildFlow() {
    const flow = [...MAIN_FLOW];
    const hasTiles = state.selectedRoofTypes.some(t => t.value === 'tiles') ||
      state.answers.some(a => a.questionId === 'roof-type' && a.value === 'tiles');
    if (hasTiles) {
      const idx = flow.indexOf('material-sizes');
      flow.splice(idx, 0, 'tiles-age');
    }
    return flow;
  }

  // Toggle a roof type in the multi-select (called from UI)
  function toggleRoofType(optionIndex) {
    const q = QUESTIONS.find(q => q.id === 'roof-type');
    const opt = q.options[optionIndex];
    const existing = state.selectedRoofTypes.findIndex(t => t.value === opt.value);
    if (existing >= 0) {
      state.selectedRoofTypes.splice(existing, 1);
    } else {
      state.selectedRoofTypes.push(opt);
    }
  }

  // Confirm multi-roof selection. Severity (stop/escalate/flag) is NOT decided
  // here — it is computed once by evaluateRoof at the material-sizes step, which
  // is the single source of truth. This just records the selection and advances.
  function confirmRoofTypes() {
    if (state.selectedRoofTypes.length === 0) return { done: false, error: 'בחר לפחות סוג גג אחד' };
    const selected = state.selectedRoofTypes;
    const labels = selected.map(t => t.label).join(' + ');
    state.answers.push({
      questionId: 'roof-type',
      label: labels,
      value: selected.map(t => t.value).join('+'),
      flagClass: 'ok',
    });

    state.step++;
    const flow = buildFlow();
    if (state.step >= flow.length) {
      state.outcome = state.flags.length > 0 ? 'go-notes' : 'go';
      return { done: true };
    }
    return { done: false };
  }

  function currentFlow() { return buildFlow(); }

  function currentQuestion() {
    const flow = currentFlow();
    if (state.step >= flow.length) return null;
    return getQuestion(flow[state.step]);
  }

  function answer(option, sizeValue) {
    const q = currentQuestion();
    const label = option.label || sizeValue + ' מ"ר';
    let value = option.value || sizeValue;

    let flagClass = option.flagClass || 'ok';
    let answerLabel = label;

    if (q.id === 'roof-orientation') {
      const az = parseInt(sizeValue) || 0;
      const a = (typeof window !== 'undefined' && window.RoofCompass)
        ? window.RoofCompass.assess(az)
        : { dir: '', yield: 0, flagClass: 'ok', flag: null };
      value = String(az);
      answerLabel = a.dir + ' · ~' + a.yield + '% ' + (a.flagClass === 'ok' ? '✅' : '⚠️');
      flagClass = a.flagClass;
      if (a.flag) state.flags.push(a.flag);
    }

    state.answers.push({ questionId: q.id, label: answerLabel, value, flagClass });

    if (option.action === 'stop') {
      state.outcome = 'stop';
      state.stopReason = option.stopReason;
      state.stopScript = option.stopScript;
      return { done: true };
    }
    if (option.action === 'follow-up') {
      state.outcome = 'follow-up';
      state.followUpNote = option.followUpNote;
      return { done: true };
    }
    if (option.action === 'escalate') {
      state.outcome = 'escalate';
      state.escalateNote = option.escalateNote;
      return { done: true };
    }
    if (option.action === 'flag') {
      if (option.flagMsg) state.flags.push(option.flagMsg);
    }

    state.step++;
    const flow = currentFlow();
    if (state.step >= flow.length) {
      state.outcome = state.flags.length > 0 ? 'go-notes' : 'go';
      return { done: true };
    }
    return { done: false };
  }

  function getState() { return state; }

  // Materials the rep selected, for rendering one size field each.
  function selectedMaterials() {
    return state.selectedRoofTypes.map(t => {
      const mat = roofConfig.materials.find(m => m.id === t.value);
      return { id: t.value, label: mat ? mat.label : t.value, emoji: mat ? mat.emoji : '' };
    });
  }

  // Submit per-material sizes: [{ materialId, size }]. Runs evaluateRoof (the
  // single source of truth) and maps its outcome onto the wizard state machine.
  function answerMaterialSizes(sizes) {
    const r = evaluateRoof(sizes, roofConfig);
    const recap = r.perMaterial.map(p => `${p.label} ${p.size}מ"ר`).join(' + ');
    const hasWarn = r.flags.length > 0 || r.perMaterial.some(p => p.outcome === 'warn');
    state.answers.push({
      questionId: 'material-sizes',
      label: recap + (hasWarn ? ' ⚠️' : ' ✅'),
      value: sizes.map(s => `${s.materialId}:${s.size}`).join(','),
      flagClass: hasWarn ? 'warn' : 'ok',
    });

    if (r.outcome === 'stop') {
      state.outcome = 'stop';
      state.stopReason = r.stopReason;
      state.stopScript = r.stopScript;
      return { done: true };
    }
    if (r.outcome === 'escalate') {
      state.outcome = 'escalate';
      state.escalateNote = r.escalateNote;
      return { done: true };
    }
    r.flags.forEach(f => { if (f) state.flags.push(f); });

    state.step++;
    const flow = currentFlow();
    if (state.step >= flow.length) {
      state.outcome = state.flags.length > 0 ? 'go-notes' : 'go';
      return { done: true };
    }
    return { done: false };
  }

  return { reset, currentQuestion, currentFlow, answer, getState, toggleRoofType, confirmRoofTypes, selectedMaterials, answerMaterialSizes };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(module.exports || {}, { Wizard, evaluateRoof });
}
