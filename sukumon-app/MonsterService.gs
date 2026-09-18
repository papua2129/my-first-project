function syncMonsters() {
  try {
    const folderId = settings().DRIVE_FOLDER_ID;
    if (!folderId) throw new Error('DriveフォルダIDを設定してください。');
    let files;
    try { files = DriveApp.getFolderById(folderId).getFiles(); }
    catch (error) { throw new Error('DriveフォルダIDを確認してください。'); }
    const existing = rows('Monsters');
    const now = new Date();
    let imported = 0;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getMimeType() !== MimeType.PNG) continue;
      const found = existing.find(row => row.driveFileId === file.getId());
      if (found) {
        if (found.fileName !== file.getName()) {
          found.fileName = file.getName();
          found.updatedAt = now;
          writeRow('Monsters', found._row, found);
        }
        continue;
      }
      const name = file.getName().replace(/\.png$/i, '');
      appendRow('Monsters', {
        monsterId: Utilities.getUuid(), name, description: '', driveFileId: file.getId(),
        fileName: file.getName(), createdAt: now, updatedAt: now
      });
      imported++;
    }
    return { imported, total: rows('Monsters').length };
  } catch (error) { publicError(error); }
}

function monsterList() {
  return rows('Monsters').map(row => ({
    monsterId: String(row.monsterId), name: String(row.name),
    description: String(row.description || ''), driveFileId: String(row.driveFileId || '')
  }));
}

function monsterImage(monsterId) {
  try {
    const monster = rows('Monsters').find(row => row.monsterId === monsterId);
    if (!monster || !monster.driveFileId) throw new Error('画像を読み込めませんでした。');
    let blob;
    try { blob = DriveApp.getFileById(String(monster.driveFileId)).getBlob(); }
    catch (error) { throw new Error('画像を読み込めませんでした。Driveの共有権限を確認してください。'); }
    return 'data:image/png;base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (error) { publicError(error); }
}

function monsterDetail(monsterId) {
  try {
    const monster = monsterList().find(item => item.monsterId === monsterId);
    if (!monster) throw new Error('モンスターが見つかりません。');
    const attempts = rows('Challenges').filter(row => row.monsterId === monsterId).map(row => ({
      challengeId: String(row.challengeId), difficulty: Number(row.difficulty),
      status: String(row.status), startDate: dateKey(row.startDate), endDate: dateKey(row.endDate),
      totalDamage: Number(row.totalDamage || 0), maxCombo: Number(row.maxCombo || 0)
    }));
    return { monster, attempts };
  } catch (error) { publicError(error); }
}
