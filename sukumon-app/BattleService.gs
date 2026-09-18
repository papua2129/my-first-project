function activeChallenge() {
  return rows('Challenges').find(row => row.status === 'active') || null;
}

function dailyFor(challengeId) {
  return rows('DailyStats').filter(row => row.challengeId === challengeId && row.attacked === true)
    .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
}

function startChallenge(monsterId, difficulty) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (activeChallenge()) throw new Error('現在挑戦中のモンスターがあります。先に終了してください。');
    if (!rows('Monsters').some(row => row.monsterId === monsterId)) throw new Error('モンスターが見つかりません。');
    const level = Number(difficulty);
    if (![1, 2, 3].includes(level)) throw new Error('挑戦の強さを確認してください。');
    const hp = numberSetting(settings(), 'HP_' + level);
    if (hp <= 0) throw new Error('設定値が正しくありません: HP_' + level);
    const challenge = {
      challengeId: Utilities.getUuid(), monsterId, difficulty: level, maxHp: hp,
      currentHp: hp, startDate: todayKey(), endDate: '', status: 'active',
      totalDamage: 0, maxCombo: 0, firstAverage: '', lastAverage: '', highestAverage: '', comboCount: 0
    };
    appendRow('Challenges', challenge);
    return dashboard();
  } catch (error) { publicError(error); }
  finally { lock.releaseLock(); }
}

function attackToday() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const challenge = activeChallenge();
    if (!challenge) throw new Error('現在挑戦中のモンスターがありません。');
    const day = todayKey();
    if (rows('DailyStats').some(row => dateKey(row.date) === day && row.attacked === true)) {
      throw new Error('すでに今日の攻撃は完了しています。');
    }
    const history = dailyFor(challenge.challengeId);
    const config = settings();
    const scores = scoresForDate(day, config);
    if (!scores.length) throw new Error('今日の回答がまだありません。');
    const average = averageScore(scores);
    const previous = history.length ? history[history.length - 1] : null;
    const combo = comboForDay(average, previous ? Number(previous.averageScore) : null,
      previous ? Number(previous.comboCount) : 0, config,
      !!previous && dateKey(previous.date) === previousDate(day));
    const damage = damageForDay(average, combo, config);
    const before = Number(challenge.currentHp);
    const after = Math.max(0, before - damage.total);
    appendRow('DailyStats', {
      date: day, monsterId: challenge.monsterId, challengeId: challenge.challengeId,
      responseCount: scores.length, averageScore: average, baseDamage: damage.base,
      comboCount: combo, comboBonus: damage.bonus, totalDamage: damage.total,
      hpBefore: before, hpAfter: after, attacked: true, createdAt: new Date()
    });
    challenge.currentHp = after;
    challenge.totalDamage = Number(challenge.totalDamage || 0) + damage.total;
    challenge.comboCount = combo;
    challenge.maxCombo = Math.max(Number(challenge.maxCombo || 0), combo);
    challenge.firstAverage = history.length ? challenge.firstAverage : average;
    challenge.lastAverage = average;
    challenge.highestAverage = Math.max(Number(challenge.highestAverage || 0), average);
    if (after === 0) { challenge.status = 'defeated'; challenge.endDate = day; }
    writeRow('Challenges', challenge._row, challenge);
    appendRow('BattleHistory', {
      eventId: Utilities.getUuid(), challengeId: challenge.challengeId,
      date: day, action: 'attack', damage: damage.total, createdAt: new Date()
    });
    return { day, average, responseCount: scores.length, damage, combo,
      defeated: after === 0, challengeId: String(challenge.challengeId), dashboard: dashboard() };
  } catch (error) { publicError(error); }
  finally { lock.releaseLock(); }
}

function undoToday() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const day = todayKey();
    const item = rows('DailyStats').find(row => dateKey(row.date) === day && row.attacked === true);
    if (!item) throw new Error('今日の攻撃はありません。');
    const challenge = rows('Challenges').find(row => row.challengeId === item.challengeId);
    if (!challenge) throw new Error('挑戦履歴を確認してください。');
    if (challenge.status === 'cancelled') throw new Error('挑戦履歴を確認してください。');
    if (activeChallenge() && activeChallenge().challengeId !== challenge.challengeId) {
      throw new Error('現在の挑戦があるため、前の挑戦の攻撃を取り消せません。');
    }
    table('DailyStats').deleteRow(item._row);
    const remaining = dailyFor(challenge.challengeId);
    challenge.currentHp = Number(item.hpBefore);
    challenge.status = 'active';
    challenge.endDate = '';
    challenge.totalDamage = remaining.reduce((sum, row) => sum + Number(row.totalDamage), 0);
    challenge.maxCombo = remaining.reduce((max, row) => Math.max(max, Number(row.comboCount)), 0);
    challenge.comboCount = remaining.length ? Number(remaining[remaining.length - 1].comboCount) : 0;
    challenge.firstAverage = remaining.length ? Number(remaining[0].averageScore) : '';
    challenge.lastAverage = remaining.length ? Number(remaining[remaining.length - 1].averageScore) : '';
    challenge.highestAverage = remaining.length ? Math.max(...remaining.map(row => Number(row.averageScore))) : '';
    writeRow('Challenges', challenge._row, challenge);
    appendRow('BattleHistory', {
      eventId: Utilities.getUuid(), challengeId: challenge.challengeId,
      date: day, action: 'undo', damage: -Number(item.totalDamage), createdAt: new Date()
    });
    return dashboard();
  } catch (error) { publicError(error); }
  finally { lock.releaseLock(); }
}

function adjustHp(value) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const challenge = activeChallenge();
    if (!challenge) throw new Error('現在挑戦中のモンスターがありません。');
    const hp = Number(value);
    if (!Number.isInteger(hp) || hp < 1 || hp > Number(challenge.maxHp)) throw new Error('設定値が正しくありません: 現在HP');
    challenge.currentHp = hp;
    writeRow('Challenges', challenge._row, challenge);
    appendRow('BattleHistory', {
      eventId: Utilities.getUuid(), challengeId: challenge.challengeId,
      date: todayKey(), action: 'adjustHp', damage: 0, createdAt: new Date()
    });
    return dashboard();
  } catch (error) { publicError(error); }
  finally { lock.releaseLock(); }
}

function cancelChallenge() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const challenge = activeChallenge();
    if (!challenge) throw new Error('現在挑戦中のモンスターがありません。');
    challenge.status = 'cancelled';
    challenge.endDate = todayKey();
    writeRow('Challenges', challenge._row, challenge);
    appendRow('BattleHistory', {
      eventId: Utilities.getUuid(), challengeId: challenge.challengeId,
      date: todayKey(), action: 'cancel', damage: 0, createdAt: new Date()
    });
    return dashboard();
  } catch (error) { publicError(error); }
  finally { lock.releaseLock(); }
}
