// 純粋な計算をここにまとめ、フォームやシートに依存せず検証できるようにする。
function averageScore(scores) {
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function comboForDay(average, previousAverage, previousCombo, settings, isPreviousDay) {
  if (previousAverage === null || !isPreviousDay) return 0;
  return average >= numberSetting(settings, 'COMBO_MINIMUM') &&
    average - previousAverage >= numberSetting(settings, 'COMBO_RISE') ? previousCombo + 1 : 0;
}

function bonusForCombo(combo, settings) {
  if (combo <= 0) return 0;
  return numberSetting(settings, 'BONUS_' + Math.min(combo, 4));
}

function damageForDay(average, combo, settings) {
  const base = Math.round(average * numberSetting(settings, 'DAMAGE_MULTIPLIER'));
  const bonus = bonusForCombo(combo, settings);
  return { base, bonus, total: base + bonus };
}

function previousDate(day) {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function weekDates(day) {
  const date = new Date(day + 'T12:00:00Z');
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  return Array.from({ length: 5 }, (_, index) => {
    const current = new Date(date);
    current.setUTCDate(current.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

function inclusiveDays(start, end) {
  return Math.floor((new Date(end + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 86400000) + 1;
}
