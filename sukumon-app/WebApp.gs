function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('スクモン討伐アプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function dashboard() {
  try {
    const day = todayKey();
    const challenge = activeChallenge();
    const config = settings();
    const monsters = monsterList();
    const allChallenges = rows('Challenges');
    let preview = { average: null, responseCount: 0, error: '' };
    try {
      const scores = scoresForDate(day, config);
      preview = { average: averageScore(scores), responseCount: scores.length,
        error: scores.length ? '' : '今日の回答がまだありません。' };
    } catch (error) { preview.error = error.message; }
    const history = challenge ? dailyFor(challenge.challengeId) : [];
    const todayAttack = history.find(row => dateKey(row.date) === day);
    const week = weekDates(day).map((date, index) => {
      const point = history.find(row => dateKey(row.date) === date);
      return { date, label: ['月', '火', '水', '木', '金'][index], average: point ? Number(point.averageScore) : null };
    });
    return {
      day, config, spreadsheetUrl: dataBook().getUrl(),
      formUrl: PropertiesService.getScriptProperties().getProperty('SUKUMON_FORM_URL') || '',
      preview, week, todayAttacked: !!todayAttack,
      current: challenge ? {
        challengeId: String(challenge.challengeId), monsterId: String(challenge.monsterId),
        name: (monsters.find(item => item.monsterId === challenge.monsterId) || {}).name || 'スクモン',
        difficulty: Number(challenge.difficulty), maxHp: Number(challenge.maxHp),
        currentHp: Number(challenge.currentHp), comboCount: Number(challenge.comboCount || 0),
        totalDamage: Number(challenge.totalDamage || 0), startDate: dateKey(challenge.startDate)
      } : null,
      todayDamage: todayAttack ? Number(todayAttack.totalDamage) : null,
      monsters: monsters.map(monster => {
        const attempts = allChallenges.filter(row => row.monsterId === monster.monsterId);
        const defeated = attempts.filter(row => row.status === 'defeated').length;
        return {
          monsterId: monster.monsterId, name: monster.name, description: monster.description,
          status: challenge && challenge.monsterId === monster.monsterId ? 'active'
            : defeated ? 'defeated' : attempts.length ? 'retry' : 'new',
          defeatedCount: defeated
        };
      }),
      lastDefeatedId: [...allChallenges].reverse().find(row => row.status === 'defeated')?.challengeId || ''
    };
  } catch (error) { publicError(error); }
}

function battleResult(challengeId) {
  try {
    const challenge = rows('Challenges').find(row => row.challengeId === challengeId);
    if (!challenge || challenge.status !== 'defeated') throw new Error('討伐結果が見つかりません。');
    const monster = monsterList().find(item => item.monsterId === challenge.monsterId);
    const history = dailyFor(challengeId);
    return {
      challengeId, monsterId: String(challenge.monsterId), name: monster ? monster.name : 'スクモン',
      difficulty: Number(challenge.difficulty), startDate: dateKey(challenge.startDate),
      endDate: dateKey(challenge.endDate), days: inclusiveDays(dateKey(challenge.startDate), dateKey(challenge.endDate)),
      firstAverage: Number(challenge.firstAverage), lastAverage: Number(challenge.lastAverage),
      highestAverage: Number(challenge.highestAverage), maxCombo: Number(challenge.maxCombo),
      totalDamage: Number(challenge.totalDamage),
      points: history.map(row => ({ date: dateKey(row.date), average: Number(row.averageScore) }))
    };
  } catch (error) { publicError(error); }
}
