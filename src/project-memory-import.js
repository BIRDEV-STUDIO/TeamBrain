'use strict';
const fs = require('node:fs');
const path = require('node:path');

const MAX_EXPORT_BYTES = 1024 * 1024;
const MAX_RECORDS = 50;
const MAX_TITLE = 160;
const MAX_SUMMARY = 2000;

function projectKey(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function cleanText(value, limit) {
  return String(value || '').replace(/\r/g, '').trim().slice(0, limit);
}

function loadProjectMemoryExport(file, projectId) {
  const selectedProject = cleanText(projectId, 120);
  if (!selectedProject) throw new Error('Hafıza aktarımı için proje kimliği gereklidir.');
  const sourceFile = path.resolve(String(file || ''));
  if (path.extname(sourceFile).toLowerCase() !== '.json') throw new Error('Proje hafıza dışa aktarımı bir JSON dosyası olmalıdır.');
  const stat = fs.statSync(sourceFile);
  if (!stat.isFile() || stat.size > MAX_EXPORT_BYTES) throw new Error('Proje hafıza dışa aktarımı geçerli bir dosya olmalı ve 1 MB sınırını aşmamalıdır.');
  const parsed = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : parsed.records;
  if (!Array.isArray(rows)) throw new Error('Hafıza dışa aktarımı bir kayıt dizisi veya {"records": [...]} biçiminde olmalıdır.');

  const selected = [];
  let otherProjectCount = 0;
  let incompleteCount = 0;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || projectKey(row.project_id) !== projectKey(selectedProject)) {
      if (row && typeof row === 'object' && row.project_id) otherProjectCount++;
      else incompleteCount++;
      continue;
    }
    const title = cleanText(row.title, MAX_TITLE);
    const summary = cleanText(row.summary, MAX_SUMMARY);
    const source = cleanText(row.source || row.source_ref, 500);
    // Raw bodies and chats are intentionally ignored. Only reviewed summaries
    // with traceable source references can enter the sharing preview.
    if (!title || !summary || !source) { incompleteCount++; continue; }
    selected.push({ project_id: selectedProject, title, summary, source });
    if (selected.length >= MAX_RECORDS) break;
  }
  return {
    project_id: selectedProject,
    source_file: sourceFile,
    records: selected,
    excluded: { other_project: otherProjectCount, incomplete: incompleteCount },
    truncated: selected.length === MAX_RECORDS && rows.length > MAX_RECORDS
  };
}

function publishInitialProjectMemory(root, selection, actor, publish) {
  if (!selection || !selection.records || !selection.records.length) throw new Error('Seçilen projeye ait paylaşılabilir hafıza kaydı bulunamadı.');
  const summary = [
    `${selection.project_id} için ilk gözden geçirilmiş proje hafızası katkısı.`,
    ...selection.records.map(record => `- ${record.title}: ${record.summary}`)
  ].join('\n');
  const sources = [...new Set(selection.records.map(record => record.source))].join(',');
  return publish(root, {
    summary,
    sources,
    project: selection.project_id,
    actor,
    'privacy-reviewed': true
  });
}

module.exports = { loadProjectMemoryExport, publishInitialProjectMemory, projectKey };
