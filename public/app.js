'use strict';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { teams: [], team: null, project: null, snapshot: null, notificationWorkspace: null, syncHealth: null, teamChat: [], actors: [], memberRefresh: {}, chatScope: 'team', view: 'overview', calendarCursor: new Date(), selectedCalendarDate: null, treeExpanded: new Set(), treeInitializedProject: null, treeParent: null, treeScale: 1, notificationSection: 'general', updateInfo: null, query: '', type: '', vault: null, vaultEntries: [], vaultFilters: { team: '', project: '', kind: '', query: '' }, mode: null, version: 0 };
const notificationTracker = new TeamBrainNotifications.NotificationTracker(localStorage);
const names = {
  'note.created': 'Not',
  'issue.detected': 'Sorun',
  'decision.proposed': 'Karar önerisi',
  'decision.accepted': 'Kabul edilen karar',
  'change.recorded': 'Değişiklik',
  'impact.detected': 'Etki analizi',
  'session.summary.imported': 'Oturum özeti',
  'chat.message': 'Sohbet mesajı',
  'chat.reply.generated': 'Yerel yanıt'
};
const views = { overview: 'Genel bakış', projects: 'Projeler', team: 'Ekip', chat: 'Sohbet', activity: 'Aktivite', tree: 'Bilgi ağacı', decisions: 'Karar defteri', calendar: 'Takvim', tasks: 'Görevler', vault: 'Kasa', integrations: 'Bağlantılar' };
const initialParams = new URLSearchParams(location.search), requestedView = initialParams.get('view'), requestedTeam = initialParams.get('team'), requestedProject = initialParams.get('project');
if (requestedView && views[requestedView]) state.view = requestedView;
const date = value => new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const time = value => new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const today = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
$('date').textContent = today.toLocaleUpperCase('tr-TR');
const savedTheme = localStorage.getItem('teambrain-theme');
if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
function updateThemeButton() { const dark=document.documentElement.classList.contains('dark'); $('theme-toggle').textContent=dark?'☾':'☀'; $('theme-toggle').setAttribute('aria-label',dark?'Açık moda geç':'Koyu moda geç'); }
updateThemeButton();
$('theme-toggle').addEventListener('click',()=>{const dark=document.documentElement.classList.toggle('dark'); localStorage.setItem('teambrain-theme',dark?'dark':'light'); updateThemeButton();});
function renderUpdateNotice(update) {
  const notice = $('update-notice');
  notice.className = 'update-notice';
  if (update.restart_required) {
    notice.classList.add('installed'); notice.hidden = false;
    notice.innerHTML = `<span><strong>TeamBrain ${escape(update.current)} kuruldu.</strong> Yeni sürümü kullanmak için dashboard’u yeniden başlat.</span><span><button class="update-action" type="button" data-update-restart>Şimdi yeniden başlat</button></span>`;
  } else if (update.available && localStorage.getItem('teambrain-dismissed-update') !== update.latest) {
    notice.classList.add('attention'); notice.hidden = false;
    const canApply = update.installation?.supported && !update.installation?.dirty;
    notice.innerHTML = `<span>Yeni TeamBrain sürümü hazır: <strong>${escape(update.name || update.latest)}</strong> · Mevcut sürüm ${escape(update.current)}</span><span><a href="${escape(update.url)}" target="_blank" rel="noreferrer">Sürüm notları ↗</a>${canApply ? ' <button class="update-action" type="button" data-update-apply>Şimdi güncelle</button>' : ''} <button type="button" data-update-dismiss aria-label="Bildirimi kapat">×</button></span>`;
  } else { notice.hidden = true; }
  notice.querySelector('[data-update-dismiss]')?.addEventListener('click', () => { localStorage.setItem('teambrain-dismissed-update', update.latest); notice.hidden = true; renderNotificationCenter(); });
  notice.querySelector('[data-update-apply]')?.addEventListener('click', event => applyAvailableUpdate(event.currentTarget));
  notice.querySelector('[data-update-restart]')?.addEventListener('click', event => restartAfterUpdate(event.currentTarget));
}
async function checkForUpdate(manual = false) {
  try {
    const update = await api(`/api/update${manual ? '?refresh=1' : ''}`, undefined, 'GET');
    state.updateInfo = update;
    renderNotificationCenter();
    renderUpdateNotice(update);
    if (state.view === 'integrations') renderConnections();
    if (manual) toast(update.offline ? 'GitHub sürüm bilgisine ulaşılamadı.' : update.available ? `${update.latest} güncellemesi hazır.` : update.restart_required ? 'Güncelleme kurulu; yeniden başlatma gerekiyor.' : 'TeamBrain güncel.');
    return update;
  } catch (error) { if (manual) toast(error.message); return null; }
}
async function applyAvailableUpdate(button) {
  setButtonBusy(button, true, 'Kuruluyor');
  try { const update = await api('/api/update/apply', {}); state.updateInfo = update; renderUpdateNotice(update); renderNotificationCenter(); if (state.view === 'integrations') renderConnections(); toast(update.installed ? 'Güncelleme kuruldu. Yeniden başlatınca etkinleşecek.' : update.message || 'TeamBrain güncel.'); }
  catch (error) { toast(error.message); await checkForUpdate(false); }
  finally { setButtonBusy(button, false); }
}
async function restartAfterUpdate(button) {
  setButtonBusy(button, true, 'Yeniden başlatılıyor');
  try {
    await api('/api/update/restart', {}); toast('Dashboard yeniden başlatılıyor…');
    setTimeout(async function reconnect() { try { await fetch('/api/health', { cache: 'no-store' }); location.reload(); } catch { setTimeout(reconnect, 1000); } }, 1200);
  } catch (error) { toast(error.message); setButtonBusy(button, false); }
}
async function setAutomaticUpdates(enabled, button) {
  setButtonBusy(button, true, enabled ? 'Etkinleştiriliyor' : 'Kapatılıyor');
  try { const update = await api('/api/update/settings', { automatic: enabled }); state.updateInfo = update; renderUpdateNotice(update); renderConnections(); toast(enabled ? 'Güvenli otomatik güncellemeler açıldı.' : 'Otomatik güncellemeler kapatıldı.'); }
  catch (error) { toast(error.message); setButtonBusy(button, false); }
}

async function api(url, data, method = 'POST') {
  const response = await fetch(url, data === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'İşlem tamamlanamadı.');
  return result;
}
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 5500);
}
function loadingDots() { return '<span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>'; }
function setButtonBusy(button, busy, label = 'İşleniyor') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = `<span>${escape(label)}</span>${loadingDots()}`;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.idleHtml) button.innerHTML = button.dataset.idleHtml;
    delete button.dataset.idleHtml;
  }
}
function base() { return `/api/teams/${state.team}/projects/${state.project}`; }
function team() { return state.teams.find(t => t.id === state.team); }
function events() { return state.snapshot?.events || []; }
function chatEvents() { return state.chatScope === 'team' ? state.teamChat : events().filter(e => e.event_type === 'chat.message' || e.event_type === 'chat.reply.generated').reverse(); }
function rememberSelection() {
  try {
    if (state.team) localStorage.setItem('teambrain-selected-team', state.team);
    else localStorage.removeItem('teambrain-selected-team');
    if (state.project) localStorage.setItem('teambrain-selected-project', state.project);
    else localStorage.removeItem('teambrain-selected-project');
  } catch {}
}
function restoreSelection() {
  let savedTeam = null, savedProject = null;
  try {
    savedTeam = localStorage.getItem('teambrain-selected-team');
    savedProject = localStorage.getItem('teambrain-selected-project');
  } catch {}
  if (requestedTeam && state.teams.some(item => item.id === requestedTeam)) state.team = requestedTeam;
  if (!team()) {
    state.team = state.teams.find(item => item.id === savedTeam)?.id
      || state.teams.find(item => item.projects?.length)?.id
      || state.teams[0]?.id
      || null;
  }
  const projects = team()?.projects || [];
  if (requestedProject && projects.some(project => project.id === requestedProject)) state.project = requestedProject;
  if (!projects.some(project => project.id === state.project)) {
    state.project = projects.find(project => project.id === savedProject)?.id || projects[0]?.id || null;
  }
  rememberSelection();
}

function teamNotificationScope() { return state.team ? `team:${state.team}` : null; }
function projectNotificationScope() { return state.team && state.project ? `team:${state.team}:project:${state.project}` : null; }
function ownActors() {
  const workspaceActors = (state.notificationWorkspace?.teams || []).flatMap(teamItem => (teamItem.projects || []).flatMap(projectItem => [projectItem.actor, projectItem.connection?.github?.actor_id]));
  return [...state.actors, state.snapshot?.actor, state.snapshot?.connection?.github?.actor_id, ...workspaceActors].filter(Boolean);
}
function notificationContexts() {
  const baselineActor = ownActors()[0] || '__teambrain_self__';
  const teams = [], projects = [];
  for (const teamItem of state.notificationWorkspace?.teams || []) {
    const teamItems = [
      { category: 'team', id: 'baseline:team', actor: baselineActor },
      { category: 'chat', id: 'baseline:chat', actor: baselineActor },
      ...(teamItem.members || []).map(member => ({ category: 'team', id: `member:${member.login}`, actor: member.login })),
      ...(teamItem.chat || []).filter(event => event.event_type === 'chat.message').map(event => ({ category: 'chat', id: `team-chat:${event.event_id}`, actor: event.actor_id }))
    ];
    teams.push({ team: teamItem, scope: `team:${teamItem.id}`, items: teamItems });
    for (const projectItem of teamItem.projects || []) {
      const projectItems = ['chat', 'activity', 'decisions', 'calendar', 'tasks'].map(category => ({ category, id: `baseline:${category}`, actor: baselineActor }));
      projectItems.push(...(projectItem.events || []).filter(event => event.event_type !== 'chat.reply.generated').map(event => ({
        category: event.event_type === 'chat.message' ? 'chat' : event.event_type.startsWith('decision.') ? 'decisions' : 'activity',
        id: `event:${event.event_id}`,
        actor: event.actor_id
      })));
      for (const item of projectItem.planner?.calendar || []) projectItems.push({ category: 'calendar', id: `calendar:${item.id}`, actor: item.created_by });
      for (const item of projectItem.planner?.tasks || []) {
        projectItems.push({ category: 'tasks', id: `task:${item.id}:created`, actor: item.created_by });
        if (item.completed_at) projectItems.push({ category: 'tasks', id: `task:${item.id}:done:${item.completed_at}`, actor: item.completed_by });
      }
      projects.push({ team: teamItem, project: projectItem, scope: `team:${teamItem.id}:project:${projectItem.project.id}`, items: projectItems });
    }
  }
  return { teams, projects };
}
function markViewSeen(view = state.view) {
  if (view === 'chat') {
    notificationTracker.markSeen(state.chatScope === 'team' ? teamNotificationScope() : projectNotificationScope(), view);
    return;
  }
  notificationTracker.markSeen(teamNotificationScope(), view);
  notificationTracker.markSeen(projectNotificationScope(), view);
}
function notificationCounts() {
  const teamCounts = notificationTracker.counts(teamNotificationScope());
  const projectCounts = notificationTracker.counts(projectNotificationScope());
  return Object.fromEntries(Object.keys(views).map(view => [view, (teamCounts[view] || 0) + (projectCounts[view] || 0)]));
}
function renderNotificationLights() {
  const counts = notificationCounts();
  document.querySelectorAll('#nav [data-view]').forEach(button => {
    const count = counts[button.dataset.view] || 0;
    button.classList.toggle('has-unread', count > 0);
    if (count) {
      button.dataset.unread = count > 99 ? '99+' : String(count);
      button.setAttribute('aria-label', `${views[button.dataset.view]}: ${count} okunmamış güncelleme`);
    } else {
      delete button.dataset.unread;
      button.removeAttribute('aria-label');
    }
  });
}
function setupSeenKey(teamId = state.team) { return `teambrain-setup-seen:${teamId || 'none'}`; }
function notificationSectionCounts() {
  const contexts = notificationContexts();
  const projectCounts = notificationTracker.counts(projectNotificationScope());
  const updateUnread = state.updateInfo?.available && localStorage.getItem('teambrain-notification-update-seen') !== state.updateInfo.latest ? 1 : 0;
  const setupUnread = state.team && localStorage.getItem(setupSeenKey()) !== 'true' ? 1 : 0;
  const globalUnread = notificationTracker.totalUnread([...contexts.teams, ...contexts.projects].map(context => context.scope));
  return {
    general: globalUnread + updateUnread,
    repo: Object.values(projectCounts).reduce((sum, count) => sum + count, 0) + setupUnread
  };
}
function notificationEmpty(text) { return `<div class="notification-empty">${escape(text)}</div>`; }
function generalNotificationMarkup() {
  const items = [];
  if (state.updateInfo?.available) items.push(`<a class="notification-item important" href="${escape(state.updateInfo.url)}" target="_blank" rel="noreferrer"><strong>TeamBrain güncellemesi hazır</strong><span>${escape(state.updateInfo.name || state.updateInfo.latest)} sürüm notlarını aç.</span><small>GENEL · SÜRÜM</small></a>`);
  const contexts = notificationContexts(), activity = [];
  for (const context of contexts.teams) {
    const counts = notificationTracker.counts(context.scope);
    if (counts.team) activity.push({ teamId: context.team.id, view: 'team', title: `${context.team.name} ekibi güncellendi`, text: `${counts.team} yeni ekip veya üye değişikliği var.`, label: 'EKİP', at: '' });
    for (const message of (context.team.chat || []).filter(item => item.event_type === 'chat.message')) activity.push({ teamId: context.team.id, view: 'chat', chatScope: 'team', title: message.actor_id || 'Ekip üyesi', text: String(message.body || '').slice(0, 150), label: `${context.team.name} · EKİP SOHBETİ`, at: message.created_at });
  }
  for (const context of contexts.projects) {
    const projectName = context.project.project.name, teamName = context.team.name;
    for (const event of (context.project.events || []).filter(item => item.event_type !== 'chat.reply.generated')) activity.push({ teamId: context.team.id, projectId: context.project.project.id, eventId: event.event_id, title: event.title, text: names[event.event_type] || event.event_type, label: `${teamName} · ${projectName}`, at: event.created_at });
    for (const task of context.project.planner?.tasks || []) activity.push({ teamId: context.team.id, projectId: context.project.project.id, view: 'tasks', title: task.title, text: `Görev · ${task.assignee}`, label: `${teamName} · ${projectName}`, at: task.completed_at || task.created_at });
    for (const calendar of context.project.planner?.calendar || []) activity.push({ teamId: context.team.id, projectId: context.project.project.id, view: 'calendar', title: calendar.title, text: `Etkinlik · ${calendar.date}${calendar.time ? ` ${calendar.time}` : ''}`, label: `${teamName} · ${projectName}`, at: calendar.created_at || `${calendar.date}T00:00:00` });
  }
  activity.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 20).forEach(item => {
    const target = `data-notification-team="${escape(item.teamId)}"${item.projectId ? ` data-notification-project="${escape(item.projectId)}"` : ''}${item.eventId ? ` data-notification-event="${escape(item.eventId)}"` : ''}${item.view ? ` data-notification-view="${escape(item.view)}"` : ''}${item.chatScope ? ` data-notification-chat-scope="${escape(item.chatScope)}"` : ''}`;
    items.push(`<button class="notification-item" type="button" ${target}><strong>${escape(item.title)}</strong><span>${escape(item.text)}</span><small>GENEL · ${escape(item.label)}${item.at ? ` · ${date(item.at)}` : ''}</small></button>`);
  });
  return items.join('') || notificationEmpty('Henüz genel bildirim yok.');
}
function repoNotificationMarkup() {
  const items = [], currentTeam = team(), repo = currentTeam?.github_repo;
  if (currentTeam) items.push(`<button class="notification-item important" type="button" data-notification-setup="${escape(currentTeam.id)}"><strong>${repo ? 'TeamBrain kurulumunu tamamla' : currentTeam.local_only ? 'Kişisel alanın hazır' : 'TeamBrain kurulumunu tamamla'}</strong><span>${repo?.full ? `${escape(repo.full)} reposunu AI ajanı veya terminal sihirbazıyla bağla.` : currentTeam.local_only ? 'Kayıtların bu bilgisayarda otomatik klasörlenir; GitHub bağlantısı gerekmez.' : 'Kurulum sihirbazını ve AI ajanı mesajını yeniden aç.'}</span><small>BU EKİP · ÖNEMLİ</small></button>`);
  const activity = [
    ...events().filter(item => item.event_type !== 'chat.reply.generated').map(item => ({ kind: 'event', id: item.event_id, title: item.title, text: names[item.event_type] || item.event_type, at: item.created_at })),
    ...(state.snapshot?.planner?.tasks || []).map(item => ({ kind: 'tasks', title: item.title, text: `Görev · ${item.assignee}`, at: item.created_at })),
    ...(state.snapshot?.planner?.calendar || []).map(item => ({ kind: 'calendar', title: item.title, text: `Etkinlik · ${item.date}${item.time ? ` ${item.time}` : ''}`, at: item.created_at || `${item.date}T00:00:00` }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);
  for (const item of activity) items.push(`<button class="notification-item" type="button" ${item.kind === 'event' ? `data-notification-event="${escape(item.id)}"` : `data-notification-view="${item.kind}"`}><strong>${escape(item.title)}</strong><span>${escape(item.text)}</span><small>BU REPO · ${date(item.at)}</small></button>`);
  return items.join('') || notificationEmpty('Bu repo için henüz bildirim yok.');
}
function renderNotificationCenter() {
  const panel = $('notifications-panel');
  if (!panel) return;
  const counts = notificationSectionCounts();
  const uniqueTotal = counts.general + (state.team && localStorage.getItem(setupSeenKey()) !== 'true' ? 1 : 0);
  $('notifications-badge').hidden = uniqueTotal === 0;
  $('notifications-badge').textContent = uniqueTotal > 99 ? '99+' : String(uniqueTotal);
  $('general-notification-count').textContent = counts.general ? String(counts.general) : '';
  $('repo-notification-count').textContent = counts.repo ? String(counts.repo) : '';
  document.querySelectorAll('[data-notification-section]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.notificationSection === state.notificationSection)));
  $('notifications-list').innerHTML = state.notificationSection === 'general' ? generalNotificationMarkup() : repoNotificationMarkup();
}
function markNotificationSectionSeen(section) {
  if (section === 'general') {
    const contexts = notificationContexts();
    notificationTracker.markSeenMany(contexts.teams.map(context => context.scope), ['team', 'chat']);
    notificationTracker.markSeenMany(contexts.projects.map(context => context.scope), ['chat', 'activity', 'decisions', 'calendar', 'tasks']);
    if (state.updateInfo?.available) localStorage.setItem('teambrain-notification-update-seen', state.updateInfo.latest);
  } else {
    for (const category of ['chat', 'activity', 'decisions', 'calendar', 'tasks']) notificationTracker.markSeen(projectNotificationScope(), category);
    if (state.team) localStorage.setItem(setupSeenKey(), 'true');
  }
  renderNotificationLights();
  renderNotificationCenter();
}
function observeNotifications(markCurrent = false) {
  const contexts = notificationContexts();
  for (const context of contexts.teams) notificationTracker.observe(context.scope, context.items, ownActors());
  for (const context of contexts.projects) notificationTracker.observe(context.scope, context.items, ownActors());
  if (markCurrent) markViewSeen();
  renderNotificationLights();
  renderNotificationCenter();
}

function choose() {
  $('team').innerHTML = state.teams.length ? state.teams.map(t => `<option value="${escape(t.id)}">${escape(t.name)}</option>`).join('') : '<option>Henüz ekip yok</option>';
  if (state.team) $('team').value = state.team;
  $('projects').innerHTML = (team()?.projects || []).map(p => `<button data-project="${escape(p.id)}" class="${p.id === state.project ? 'active' : ''}"><span class="project-dot"></span>${escape(p.name)}</button>`).join('');
  $('add-project').disabled = !state.team;
  $('remove-team').disabled = !state.team;
}
async function showSetupGuide(teamId) {
  try {
    const guide = await api(`/api/teams/${teamId}`, undefined, 'GET');
    localStorage.setItem(setupSeenKey(teamId), 'true');
    if (guide.mode === 'local') {
      $('setup-guide-title').textContent = 'Kişisel alan hazır';
      $('setup-content').innerHTML = `<p><strong>${escape(guide.team.name)}</strong> yalnızca bu bilgisayarda çalışan kişisel TeamBrain alanı olarak oluşturuldu. GitHub’a hiçbir kayıt gönderilmez.</p><section class="recommended-setup"><span class="badge">YEREL İKİNCİ BEYİN</span><h3>Klasörler otomatik hazırlanır</h3><p>Bu alandaki veriler <code>${escape(guide.storage_path)}</code> altında tutulur. Her proje eklendiğinde kendi kayıt, takvim, görev ve bilgi klasörleri de otomatik oluşur.</p><button class="primary" id="local-guide-create-project" type="button">İlk projeyi oluştur</button></section><ol>${guide.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol>`;
      $('setup-guide').showModal();
      $('local-guide-create-project').onclick = () => { $('setup-guide').close(); editor('project'); };
      renderNotificationCenter();
      return;
    }
    $('setup-guide-title').textContent = 'Bu ekip için kurulumu tamamla';
    const agentPrompt = TeamBrainNotifications.buildAgentSetupPrompt(guide);
    $('setup-content').innerHTML = `<p>Site ekip kaydını oluşturdu. Kod reposuna otomatik erişemediği için kurulumu aşağıdaki yöntemlerden biriyle tamamlayın.</p><section class="recommended-setup"><span class="badge">ÖNERİLEN</span><h3>AI ajanı kurulumu yapsın</h3><p>Bu mesajı Codex veya kullandığınız AI ajanına gönderin. Ajan doğru yerel repo yolunu doğrular, son seçimleri size gösterir ve TeamBrain kurulum sihirbazını çalıştırır.</p><label for="agent-setup-prompt">AI ajanına gönderilecek mesaj</label><textarea id="agent-setup-prompt" rows="7" readonly>${escape(agentPrompt)}</textarea><button class="primary" id="copy-agent-setup" type="button">AI mesajını kopyala</button></section><div class="setup-divider"><span>veya elle kur</span></div><ol>${guide.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol><label for="setup-command">CMD / PowerShell komutu</label><textarea id="setup-command" rows="4" readonly>${escape(guide.command)}</textarea><button class="secondary" id="copy-setup" type="button">Komutu kopyala</button><p class="detail-meta">Kod reposu yolundaki <code>C:\\path\\to\\code</code> bölümünü kendi klasörünüzle değiştirin.</p>`;
    $('setup-guide').showModal();
    $('copy-setup').onclick = async () => { await navigator.clipboard.writeText(guide.command); toast('Kurulum komutu panoya kopyalandı.'); };
    $('copy-agent-setup').onclick = async () => { await navigator.clipboard.writeText(agentPrompt); toast('AI ajanı kurulum mesajı panoya kopyalandı.'); };
    renderNotificationCenter();
  } catch (error) { toast(error.message); }
}
async function reloadTeams() {
  if (!state.actors.length) state.actors = (await api('/api/identity')).aliases || [];
  [state.teams, state.syncHealth, state.notificationWorkspace] = await Promise.all([api('/api/teams'), api('/api/sync'), api('/api/notifications')]);
  restoreSelection();
  choose();
  await loadTeamChat();
  await loadProject();
  if (state.view === 'vault') await loadVault();
}
async function loadVault(force = false) {
  if (state.vault && !force) { render(); return; }
  $('content').innerHTML = '<div class="panel empty" role="status">Kasa hazırlanıyor…</div>';
  try { state.vault = await api('/api/vault'); render(); }
  catch (error) { toast(error.message); $('content').innerHTML = `<section class="panel">${empty('Kasa açılamadı.', error.message)}</section>`; }
}
async function loadTeamChat() {
  if (!state.team) { state.teamChat = []; return; }
  try { state.teamChat = await api(`/api/teams/${state.team}/chat`); }
  catch (error) {
    if (error.message === 'Bulunamadı.') { state.teamChat = []; return; }
    throw error;
  }
}
async function loadProject() {
  const version = ++state.version;
  state.snapshot = null;
  render();
  if (!state.project) { observeNotifications(state.view === 'team' || state.view === 'chat'); return; }
  try {
    const result = await api(base());
    if (version !== state.version) return;
    state.snapshot = result;
    choose();
    observeNotifications(['team', 'chat', 'activity', 'decisions', 'calendar', 'tasks'].includes(state.view));
    render();
  } catch (error) {
    if (version === state.version) toast(error.message);
  }
}
function empty(title, text, action) {
  return `<div class="empty"><span class="empty-symbol">✳</span><h3>${title}</h3><p>${text}</p>${action ? `<button class="secondary" data-action="${action.id}">${action.text}</button>` : ''}</div>`;
}
function eventIcon(event) {
  if (event.event_type === 'issue.detected') return '!';
  if (event.event_type.startsWith('decision.')) return '◇';
  if (event.event_type.startsWith('chat.')) return '◌';
  return '≋';
}
function record(event) {
  const issue = event.event_type === 'issue.detected';
  const actor = event.actor_id || 'Bilinmeyen kullanıcı';
  return `<button class="record" data-event="${escape(event.event_id)}"><span class="record-icon ${issue ? 'issue' : ''}">${eventIcon(event)}</span><span class="record-main"><span class="record-title">${escape(event.title)}</span><span class="record-preview">${escape(event.body || 'Bağlamı görmek için kaydı aç.')}</span><span class="record-meta">Kullanıcı: ${escape(actor)} · ${escape(names[event.event_type] || event.event_type)}</span></span><time class="record-time" datetime="${escape(event.created_at)}"><span>${date(event.created_at)} · ${time(event.created_at)}</span></time></button>`;
}
function filtered() {
  return events().filter(e => (!state.query || `${e.title} ${e.body}`.toLocaleLowerCase('tr-TR').includes(state.query.toLocaleLowerCase('tr-TR'))) && (!state.type || e.event_type === state.type) && (state.view !== 'decisions' || e.event_type.startsWith('decision.')));
}
function renderList() {
  const target = $('results');
  if (target) target.innerHTML = filtered().map(record).join('') || empty('Burada henüz bir kayıt yok.', 'Aramanı değiştirebilir veya yeni bir kayıt ekleyebilirsin.');
}
function renderShell(data, decisions) {
  document.body.classList.toggle('calendar-active', state.view === 'calendar');
  $('breadcrumb').textContent = state.view === 'vault' ? 'Çalışma alanı / Kasa' : state.view === 'projects' ? `${team()?.name || 'Çalışma alanı'} / Projeler` : `${team()?.name || 'Çalışma alanı'}${data ? ' / ' + data.project.name : ''}`;
  $('heading').textContent = state.view === 'overview' ? data?.project.name || 'Ekibinin ortak hafızası.' : views[state.view];
  $('subtitle').textContent = state.view === 'vault' ? 'TeamBrain’de saklanan her şeyi ekipler ve projeler arasında bul.' : state.view === 'projects' ? 'Kişisel projelerini ayrı hafızalar olarak aç ve aralarında geçiş yap.' : state.view === 'chat' ? 'Projenin hafızasıyla konuş; her mesaj aynı zamanda kayıt olur.' : state.view === 'tree' ? 'Konuların hangi kararlara ve çalışmalara dönüştüğünü dallarıyla izle.' : state.view === 'overview' ? 'Kararlar, çalışmalar ve onları birbirine bağlayan nedenler.' : 'Seçili projenin bilgisi. İhtiyacın olan bağlam, bir arada.';
  $('profile').textContent = (data?.actor || 'Y').slice(0, 1).toUpperCase();
  $('profile').title = data?.actor || 'Yerel kullanıcı';
  $('new-event').disabled = !data;
  $('upload-document').disabled = !data;
  $('new-event').hidden = state.view === 'projects' || state.view === 'vault';
  $('upload-document').hidden = state.view === 'projects' || state.view === 'vault';
  $('hero').hidden = state.view !== 'overview';
  $('hero-action').textContent = !state.team ? 'İlk ekibini oluştur ↗' : !state.project ? 'İlk projeni oluştur ↗' : 'Bir karar kaydet ↗';
  $('metrics').hidden = !data || state.view === 'integrations' || state.view === 'vault' || state.view === 'chat' || state.view === 'tree' || state.view === 'projects';
  $('metrics').innerHTML = [[data?.total || 0, 'Toplam kayıt', 'Projenin kalıcı hafızası', '≋'], [decisions.length, 'Karar kaydı', 'Gerekçesiyle birlikte', '◇'], [events().filter(e => e.event_type === 'issue.detected').length, 'Sorun kaydı', 'Açık/kapalı takibi henüz yok', '◌'], [new Set(events().map(e => e.actor_id)).size, 'Katkı veren', 'Kayıtlardaki farklı kişiler', '↗']].map(([n, label, hint, icon]) => `<div class="metric"><div class="metric-top"><span>${label}</span><span>${icon}</span></div><strong>${n}</strong><small>${hint}</small></div>`).join('');
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === state.view); b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'); });
  $('browse-projects').classList.toggle('active', state.view === 'projects');
  $('browse-projects').setAttribute('aria-current', state.view === 'projects' ? 'page' : 'false');
  renderNotificationLights();
  renderNotificationCenter();
}
function renderProjects() {
  const projects = team()?.projects || [];
  $('content').innerHTML = `<div class="project-gallery-heading"><div><span class="eyebrow">${team()?.local_only ? 'YEREL İKİNCİ BEYİN' : 'ÇALIŞMA ALANI'}</span><h2>${escape(team()?.name || 'Projeler')}</h2><p>${projects.length} proje ayrı hafıza alanında tutuluyor.</p></div><button class="primary" data-action="project">＋ Yeni proje</button></div><section class="project-gallery">${projects.map(project => `<button type="button" class="project-card ${project.id === state.project ? 'selected' : ''}" data-project-open="${escape(project.id)}"><span class="project-card-icon">✳</span><span class="project-card-body"><span class="project-card-top"><strong>${escape(project.name)}</strong><span class="badge">${project.source_root ? 'OTOMATİK' : 'YEREL'}</span></span><small>${project.source_root ? escape(project.source_root) : 'TeamBrain yerel proje alanı'}</small><span class="project-card-action">Projeyi aç <b>→</b></span></span></button>`).join('') || `<div class="panel">${empty('Henüz proje yok.', 'Artı düğmesiyle ilk kişisel projenizi oluşturun.', { id: 'project', text: '＋ Proje oluştur' })}</div>`}</section>`;
}
function plannerEditor(mode, selectedDate = '') {
  state.mode = mode; $('form-error').textContent = '';
  $('editor-title').textContent = mode === 'calendar' ? 'Takvime etkinlik ekle' : 'Yeni görev oluştur';
  const members = state.snapshot?.members || [];
  const assignee = members.length ? `<select name="assignee" required><option value="">Ekip üyesi seç</option>${members.map(member => `<option value="${escape(member.login)}">${escape(member.name || member.login)} (@${escape(member.login)})</option>`).join('')}</select>` : `<input name="assignee" maxlength="200" required placeholder="Örn. Emre"><small class="detail-meta">GitHub üyeleri henüz okunamadı; kullanıcı kimliğini elle yazabilirsin.</small>`;
  $('fields').innerHTML = mode === 'calendar' ? `<label>Etkinlik adı</label><input name="title" maxlength="200" required placeholder="Örn. Sprint planlama"><label>Tarih</label><input name="date" type="date" required value="${escape(selectedDate)}"><label>Saat</label><input name="time" type="time"><label>Konum veya bağlantı</label><input name="location" maxlength="200" placeholder="Örn. Toplantı odası / bağlantı"><label>Not</label><textarea name="notes" maxlength="2000" placeholder="Ekip için kısa not"></textarea>` : `<label>Görev</label><input name="title" maxlength="200" required placeholder="Örn. Test senaryolarını hazırla"><label>Sorumlu ekip üyesi</label>${assignee}<label>Son tarih</label><input name="due_date" type="date"><label>Açıklama</label><textarea name="description" maxlength="2000" placeholder="Beklenen çıktı"></textarea>`;
  $('editor').showModal(); $('fields').querySelector('input')?.focus();
}
function renderCalendar() {
  const cursor = state.calendarCursor || new Date(), year = cursor.getFullYear(), month = cursor.getMonth();
  const monthName = new Date(year, month, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  const items = state.snapshot.planner?.calendar || [], byDate = items.reduce((map, item) => { (map[item.date.slice(0, 10)] ||= []).push(item); return map; }, {});
  const first = new Date(year, month, 1), offset = (first.getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - offset + 1, dateObj = new Date(year, month, dayNumber), current = dayNumber > 0 && dayNumber <= days;
    const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    const dayItems = byDate[key] || [], todayKey = new Date().toISOString().slice(0, 10);
    return `<button type="button" class="month-cell ${current ? '' : 'outside'} ${key === todayKey ? 'today' : ''} ${key === state.selectedCalendarDate ? 'selected' : ''} ${dayItems.length ? 'has-events' : ''}" data-calendar-date="${key}" aria-label="${escape(dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }))}; ${dayItems.length} etkinlik"><span class="cell-number">${dateObj.getDate()}</span>${dayItems.slice(0, 3).map((item, itemIndex) => `<span class="calendar-chip chip-${itemIndex % 4}" title="${escape(item.title)}">${item.time ? `<small>${escape(item.time)}</small>` : ''}${escape(item.title)}</span>`).join('')}${dayItems.length > 3 ? `<span class="more-events">+${dayItems.length - 3} etkinlik</span>` : ''}</button>`;
  }).join('');
  $('content').innerHTML = `<div class="calendar-heading"><div><span class="eyebrow">EKİP PLANI</span><h2>${escape(monthName.charAt(0).toLocaleUpperCase('tr-TR') + monthName.slice(1))}</h2><p>${state.selectedCalendarDate ? `${escape(new Date(`${state.selectedCalendarDate}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }))} seçildi · Etkinlik eklemek için çift tıkla` : items.length ? `${items.length} etkinlik planlandı · Bir güne çift tıklayarak etkinlik ekle` : 'Bir güne çift tıklayarak ilk etkinliği ekle.'}</p></div><div class="calendar-actions"><button class="secondary" data-calendar-nav="prev" aria-label="Önceki ay">‹</button><button class="secondary today-button" data-calendar-nav="today">Bugün</button><button class="secondary" data-calendar-nav="next" aria-label="Sonraki ay">›</button><button class="primary" data-action="calendar">＋ Etkinlik ekle</button></div></div><section class="calendar-panel"><div class="weekdays">${['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].map(day => `<span>${day}</span>`).join('')}</div><div class="month-grid">${cells}</div></section><div class="calendar-legend"><span><i class="legend-dot chip-0"></i>Toplantı</span><span><i class="legend-dot chip-1"></i>Teslim</span><span><i class="legend-dot chip-2"></i>Çalışma</span><span><i class="legend-dot chip-3"></i>Diğer</span></div>`;
}function renderTasks() {
  const tasks = state.snapshot.planner?.tasks || [], done = tasks.filter(t => t.status === 'done').length;
  $('content').innerHTML = `<div class="planner-toolbar"><div><h2>Ekip görevleri</h2><p>${done}/${tasks.length} görev tamamlandı. Sorumlu kişi bitirdiğinde kutuyu işaretleyin.</p></div><button class="primary" data-action="task">＋ Görev ata</button></div><section class="panel planner-list">${tasks.map(task => `<article class="task-item ${task.status === 'done' ? 'done' : ''}"><button class="task-check" data-task="${escape(task.id)}" aria-label="${task.status === 'done' ? 'Tamamlandı olarak işaretini kaldır' : 'Görevi tamamlandı işaretle'}">${task.status === 'done' ? '✓' : ''}</button><div><h3>${escape(task.title)}</h3><p>Sorumlu: <strong>${escape(task.assignee)}</strong>${task.due_date ? ` · Son tarih: ${escape(task.due_date)}` : ''}</p>${task.description ? `<small>${escape(task.description)}</small>` : ''}${task.completed_by ? `<small class="task-completed">Tamamlayan: ${escape(task.completed_by)}</small>` : ''}</div></article>`).join('') || empty('Henüz görev yok.', 'Ekip üyelerine görev atayarak başlayın.', {id:'task',text:'＋ İlk görevi ata'})}</section>`;
}
const vaultKinds = {
  record: ['Kayıtlar', '≋'], decision: ['Kararlar', '◇'], issue: ['Sorunlar', '!'], session: ['Oturumlar', '⌁'],
  chat: ['Sohbetler', '◌'], document: ['Belgeler', '▤'], task: ['Görevler', '✓'], calendar: ['Takvim', '◷'], member: ['Üyeler', '♧'], shared: ['Paylaşılan hafıza', '◈']
};
function vaultEventKind(event) {
  if (event.event_type?.startsWith('decision.')) return 'decision';
  if (event.event_type === 'issue.detected') return 'issue';
  if (event.event_type?.startsWith('session.')) return 'session';
  if (event.event_type?.startsWith('chat.')) return 'chat';
  return 'record';
}
function buildVaultEntries() {
  const entries = [];
  for (const item of state.vault?.shared || []) entries.push({ id: `shared:${item.path}`, kind: 'shared', title: item.title, body: item.body || '', teamId: '', teamName: 'TeamBrain', projectId: '', projectName: item.path, at: item.updated_at, raw: item });
  for (const teamItem of state.vault?.teams || []) {
    for (const member of teamItem.members || []) entries.push({ id: `member:${teamItem.id}:${member.login}`, kind: 'member', title: member.name || member.login, body: `@${member.login}`, actor: member.login, teamId: teamItem.id, teamName: teamItem.name, projectId: '', projectName: 'Ekip geneli', at: '' });
    for (const message of teamItem.chat || []) entries.push({ id: `team-chat:${teamItem.id}:${message.event_id}`, kind: 'chat', title: message.title || `${message.actor_id || 'Ekip üyesi'} mesajı`, body: message.body || '', actor: message.actor_id, teamId: teamItem.id, teamName: teamItem.name, projectId: '', projectName: 'Ekip sohbeti', at: message.created_at, raw: message });
    for (const projectItem of teamItem.projects || []) {
      const projectId = projectItem.project?.id || '', projectName = projectItem.project?.name || 'Adsız proje';
      for (const event of projectItem.events || []) entries.push({ id: `event:${teamItem.id}:${projectId}:${event.event_id}`, kind: vaultEventKind(event), title: event.title || 'Başlıksız kayıt', body: event.body || '', actor: event.actor_id, teamId: teamItem.id, teamName: teamItem.name, projectId, projectName, at: event.created_at, raw: event });
      for (const document of projectItem.documents || []) { const filename = document.filename || String(document.file || '').split('/').pop().replace(/^[0-9a-f-]{36}-/, '').replace(/\.md$/i, '').replace(/-/g, ' '); entries.push({ id: `document:${teamItem.id}:${projectId}:${document.file}`, kind: 'document', title: filename || 'İçe aktarılan belge', body: document.body || document.file || '', teamId: teamItem.id, teamName: teamItem.name, projectId, projectName, at: document.imported_at || '', raw: document }); }
      for (const task of projectItem.planner?.tasks || []) entries.push({ id: `task:${teamItem.id}:${projectId}:${task.id}`, kind: 'task', title: task.title, body: task.description || `${task.assignee || 'Atanmamış'} · ${task.status === 'done' ? 'Tamamlandı' : 'Açık'}`, actor: task.assignee, teamId: teamItem.id, teamName: teamItem.name, projectId, projectName, at: task.created_at || task.due_date, raw: task });
      for (const item of projectItem.planner?.calendar || []) entries.push({ id: `calendar:${teamItem.id}:${projectId}:${item.id}`, kind: 'calendar', title: item.title, body: [item.date, item.time, item.location, item.notes].filter(Boolean).join(' · '), actor: item.created_by, teamId: teamItem.id, teamName: teamItem.name, projectId, projectName, at: item.created_at || (item.date ? `${item.date}T${item.time || '00:00'}:00` : ''), raw: item });
    }
  }
  return entries.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')) || a.title.localeCompare(b.title, 'tr'));
}
function filteredVaultEntries() {
  const filters = state.vaultFilters, query = filters.query.toLocaleLowerCase('tr-TR');
  return state.vaultEntries.filter(item => (!filters.team || item.teamId === filters.team) && (!filters.project || item.projectId === filters.project) && (!filters.kind || item.kind === filters.kind) && (!query || `${item.title} ${item.body} ${item.actor || ''} ${item.teamName} ${item.projectName}`.toLocaleLowerCase('tr-TR').includes(query)));
}
function vaultEntryMarkup(item) {
  const [label, icon] = vaultKinds[item.kind] || vaultKinds.record;
  return `<button class="vault-entry" type="button" data-vault-entry="${escape(item.id)}"><span class="vault-entry-icon kind-${escape(item.kind)}">${icon}</span><span class="vault-entry-copy"><span class="vault-entry-top"><strong>${escape(item.title)}</strong><span class="vault-kind">${escape(label)}</span></span><span class="vault-entry-preview">${escape(item.body || 'Ek açıklama bulunmuyor.')}</span><span class="vault-entry-meta"><b>${escape(item.teamName)}</b><i>›</i>${escape(item.projectName)}${item.actor ? `<i>·</i>${escape(item.actor)}` : ''}</span></span>${item.at ? `<time datetime="${escape(item.at)}">${date(item.at)}<small>${time(item.at)}</small></time>` : ''}</button>`;
}
function renderVaultResults() {
  const filtered = filteredVaultEntries(), target = $('vault-results'), count = $('vault-result-count');
  if (count) count.textContent = `${filtered.length} öğe`;
  if (target) target.innerHTML = filtered.map(vaultEntryMarkup).join('') || empty('Bu seçimde kayıt yok.', 'Ekip, proje, tür veya arama seçimini değiştirin.');
}
function renderVault() {
  if (!state.vault) { $('content').innerHTML = '<div class="panel empty" role="status">Kasa hazırlanıyor…</div>'; return; }
  state.vaultEntries = buildVaultEntries();
  const filters = state.vaultFilters, teams = state.vault.teams || [];
  if (filters.team && !teams.some(item => item.id === filters.team)) filters.team = '';
  const selectedTeam = teams.find(item => item.id === filters.team), projects = selectedTeam ? selectedTeam.projects : teams.flatMap(teamItem => (teamItem.projects || []).map(projectItem => ({ ...projectItem, teamName: teamItem.name })));
  if (filters.project && !projects.some(item => item.project?.id === filters.project)) filters.project = '';
  const projectCount = teams.reduce((sum, item) => sum + (item.projects?.length || 0), 0);
  const documentCount = state.vaultEntries.filter(item => item.kind === 'document' || item.kind === 'shared').length;
  const peopleCount = new Set(state.vaultEntries.filter(item => item.actor).map(item => item.actor)).size;
  const warnings = teams.flatMap(item => (item.projects || []).filter(project => project.error).map(project => `${item.name} / ${project.project.name}: ${project.error}`));
  $('content').innerHTML = `<section class="vault-hero"><div><span class="eyebrow">TEAMBRAIN KASASI</span><h2>Hafızanın tamamı,<br><em>tek ve sakin bir yerde.</em></h2><p>Kayıtlar değişmeden kendi ekip ve proje bağlamında kalır. Kasa yalnızca hepsini güvenli, salt okunur bir görünümde bir araya getirir.</p></div><div class="vault-seal" aria-hidden="true"><span>▣</span><small>YEREL<br>HAFIZA</small></div></section><section class="vault-stats"><div><strong>${teams.length}</strong><span>Ekip</span></div><div><strong>${projectCount}</strong><span>Proje</span></div><div><strong>${state.vaultEntries.length}</strong><span>Saklanan öğe</span></div><div><strong>${documentCount}</strong><span>Dosya</span></div><div><strong>${peopleCount}</strong><span>Katkı veren</span></div></section><section class="vault-controls" aria-label="Kasa filtreleri"><label><span>Ekip</span><select id="vault-team"><option value="">Tüm ekipler</option>${teams.map(item => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join('')}</select></label><label><span>Proje</span><select id="vault-project"><option value="">Tüm projeler</option>${projects.map(item => `<option value="${escape(item.project.id)}">${escape(item.teamName ? `${item.teamName} / ` : '')}${escape(item.project.name)}</option>`).join('')}</select></label><label><span>İçerik</span><select id="vault-kind"><option value="">Her şey</option>${Object.entries(vaultKinds).map(([value, meta]) => `<option value="${value}">${meta[0]}</option>`).join('')}</select></label><label class="vault-search"><span>Ara</span><input id="vault-search" type="search" value="${escape(filters.query)}" placeholder="Başlık, açıklama veya kişi ara…"></label><button class="vault-refresh" type="button" data-action="vault-refresh" title="Kasayı yenile" aria-label="Kasayı yenile">↻</button></section>${warnings.length ? `<div class="vault-warning"><strong>${warnings.length} proje okunamadı.</strong><span>${escape(warnings.join(' · '))}</span></div>` : ''}<section class="vault-library panel"><header><div><span class="eyebrow">KAYIT KATALOĞU</span><h3>Her şey</h3></div><span id="vault-result-count"></span></header><div id="vault-results" class="vault-results"></div></section>`;
  $('vault-team').value = filters.team; $('vault-project').value = filters.project; $('vault-kind').value = filters.kind;
  $('vault-team').onchange = event => { filters.team = event.target.value; filters.project = ''; renderVault(); };
  $('vault-project').onchange = event => { filters.project = event.target.value; renderVaultResults(); };
  $('vault-kind').onchange = event => { filters.kind = event.target.value; renderVaultResults(); };
  $('vault-search').oninput = event => { filters.query = event.target.value; renderVaultResults(); };
  renderVaultResults();
}
function showVaultDetail(entryId) {
  const item = state.vaultEntries.find(entry => entry.id === entryId); if (!item) return;
  const [label] = vaultKinds[item.kind] || vaultKinds.record;
  $('detail-content').innerHTML = `<div class="vault-detail-path"><span>${escape(item.teamName)}</span><b>›</b><span>${escape(item.projectName)}</span></div><span class="badge">${escape(label)}</span><h2>${escape(item.title)}</h2><p class="detail-meta">${item.actor ? `${escape(item.actor)} · ` : ''}${item.at ? `${date(item.at)} · ${time(item.at)}` : 'Tarih bilgisi yok'}</p><div class="detail-body">${escape(item.body || 'Ek açıklama bulunmuyor.')}</div>${item.kind === 'task' ? `<p class="detail-meta">Durum: ${item.raw.status === 'done' ? 'Tamamlandı' : 'Açık'}${item.raw.due_date ? ` · Son tarih: ${escape(item.raw.due_date)}` : ''}</p>` : ''}${item.kind === 'document' ? `<p class="detail-meta">Kasa yolu: ${escape(item.raw.file)}</p>` : ''}${item.kind === 'shared' && item.raw.truncated ? '<p class="detail-meta">Bu büyük dosyanın ilk 100.000 karakteri gösteriliyor.</p>' : ''}`;
  $('detail').showModal();
}
function render() {
  const data = state.snapshot;
  const decisions = events().filter(e => e.event_type.startsWith('decision.'));
  renderShell(data, decisions);
  if (state.view === 'team') { renderTeam(); return; }
  if (state.view === 'chat' && !state.project) { renderChat(); return; }
  if (state.view === 'integrations') { renderConnections(); return; }
  if (state.view === 'vault') { renderVault(); return; }
  if (state.view === 'projects') { renderProjects(); return; }
  if (!state.project) {
    const labels = {
      overview: ['Bu ekibin ilk projesini ekle.', 'Genel bakış, proje kayıtları oluşturulduğunda burada görünür.'],
      activity: ['Aktivite için bir proje gerekli.', 'Kayıtlar ve değişiklikler proje bazında tutulur.'],
      tree: ['Bilgi ağacı için bir proje gerekli.', 'Kayıtlar birbirine bağlandıkça proje ağacı burada oluşur.'],
      decisions: ['Karar defteri için bir proje gerekli.', 'Kararlar, ait oldukları projenin gerekçeleriyle birlikte saklanır.'],
      calendar: ['Takvim için bir proje gerekli.', 'Etkinlikler seçili projenin planına eklenir.'],
      tasks: ['Görevler için bir proje gerekli.', 'Görevler seçili projenin ekip üyelerine atanır.']
    };
    const [title, text] = state.team ? (labels[state.view] || labels.overview) : ['Kişisel veya ekip alanını başlat.', 'GitHub bağlamadan kişisel ikinci beynini oluşturabilir ya da ekip paylaşımı için repo ekleyebilirsin.'];
    $('content').innerHTML = `<section class="panel">${empty(title, text, { id: state.team ? 'project' : 'team', text: state.team ? '＋ Proje oluştur' : '＋ Ekip oluştur' })}</section>`;
    return;
  }
  if (!data) { $('content').innerHTML = '<div class="panel empty" role="status">Proje yükleniyor…</div>'; return; }
  if (state.view === 'team') renderTeam();
  else if (state.view === 'overview') renderOverview(decisions);
  else if (state.view === 'chat') renderChat();
  else if (state.view === 'tree') renderTree();
  else if (['activity', 'decisions'].includes(state.view)) renderActivity();
  else if (state.view === 'calendar') renderCalendar();
  else if (state.view === 'tasks') renderTasks();
  else renderConnections();
}
function renderTeam() {
  const current = team() || {}, members = current.members || state.snapshot?.members || [], repo = current.github_repo, localOnly = current.local_only === true;
  const status = current.members_state === 'synced' ? 'GitHub’dan güncel' : current.members_state === 'cached' ? 'Yerel önbellek' : 'Üye listesi bekleniyor';
  const storage = repo
    ? `<section class="panel connection"><h3>GitHub ekibi</h3><span class="badge">${escape(status)}</span><p>Bağlı repo: <a href="${escape(repo.url)}" target="_blank" rel="noreferrer">${escape(repo.full)}</a></p><button class="secondary" data-action="refresh-members">Üyeleri yenile</button></section>`
    : localOnly ? `<section class="panel connection"><h3>Kişisel TeamBrain alanı</h3><span class="badge">YALNIZCA BU BİLGİSAYAR</span><p>Kayıtlar otomatik olarak <code>${escape(current.storage_path || `teams/${current.id || ''}`)}</code> altında klasörlenir. GitHub bağlantısı gerekmez ve veri gönderilmez.</p><button class="secondary" data-action="local-setup">Klasör yapısını gör</button></section>` : `<section class="panel connection"><h3>GitHub ekibi</h3><span class="badge">BAĞLANMADI</span><p>Bu alan henüz bir GitHub memory reposuna bağlanmadı.</p></section>`;
  $('content').innerHTML = `<div class="connections">${storage}<section class="panel connection"><h3>${repo ? 'Ekip üyeleri' : localOnly ? 'Kişisel kullanım' : 'Ekip üyeleri'}</h3><span class="badge">${repo ? `${members.length} kişi` : localOnly ? 'YEREL' : 'BEKLİYOR'}</span><p>${repo ? (members.length ? 'GitHub reposundaki erişimi olan kişiler aşağıda listelenir.' : 'Üyeler görünmüyorsa GitHub erişimini ve gh oturumunu kontrol edip yenile.') : localOnly ? 'Bir proje ekleyerek notlarını, kararlarını, görevlerini ve takvimini ayrı bir hafızada tutabilirsin.' : 'Ekip paylaşımı için GitHub memory reposunu açıkça bağlayın.'}</p></section></div><section class="panel member-list"><div class="panel-head"><h2>${repo ? 'Üyeler' : localOnly ? 'Projelerin için hazır' : 'Üyeler'}</h2><span class="record-meta">${repo ? 'Görev atamalarında kullanılabilir' : localOnly ? 'GitHub olmadan da çalışır' : 'GitHub bağlantısı gerekli'}</span></div><div class="feed">${repo ? (members.map(member => `<div class="record member-row"><span class="record-icon">●</span><span class="record-main"><span class="record-title">${escape(member.name || member.login)}</span><span class="record-meta">@${escape(member.login)}${member.permissions?.admin ? ' · yönetici' : ''}</span></span></div>`).join('') || empty('Henüz üye görünmüyor.', 'GitHub reposundaki üyeleri çekmek için Üyeleri yenile düğmesine bas.')) : localOnly ? empty('İlk kişisel projenizi ekleyin.', 'Her proje için klasörler ve yerel kayıt geçmişi otomatik hazırlanır.', { id: 'project', text: '＋ Proje oluştur' }) : empty('Henüz üye görünmüyor.', 'Ekip hafızası bağlandığında üyeler burada görünür.')}</div></section>`;
}
function renderOverview(decisions) {
  $('content').innerHTML = `<div class="content-grid"><section class="panel"><div class="panel-head"><h2>Son hareketler</h2><button class="text-button" data-action="activity">Tümünü gör ↗</button></div><div class="feed">${events().filter(e => !e.event_type.startsWith('chat.')).slice(0, 5).map(record).join('') || empty('İlk kaydınla hikâye başlasın.', 'Bir gelişme, fikir veya karar ekle.', { id: 'event', text: 'Yeni kayıt' })}</div></section><section class="panel"><div class="panel-head"><h2>Karar defteri</h2><span>◇</span></div>${decisions.slice(0, 3).map(e => `<button class="decision-card" data-event="${escape(e.event_id)}"><span class="badge">${escape(names[e.event_type] || 'Karar')}</span><h3>${escape(e.title)}</h3><span class="record-meta">${date(e.created_at)} · Gerekçeyi aç ↗</span></button>`).join('') || empty('Nedenini de hatırla.', 'Aldığınız kararları gerekçesiyle kaydedin.')}</section></div><div class="link-status">◉ &nbsp; Kayıtlar bu bilgisayarda saklanıyor. Sohbet dahil tüm proje hafızası yerel event olarak tutulur.</div>`;
}
function treeKind(event) {
  if (event.event_type === 'issue.detected') return ['issue', 'SORUN', '!'];
  if (event.event_type.startsWith('decision.')) return ['decision', 'KARAR', '◇'];
  if (event.event_type === 'change.recorded') return ['change', 'DEĞİŞİKLİK', '↗'];
  if (event.event_type === 'impact.detected') return ['impact', 'ETKİ', '⌁'];
  return ['note', 'NOT', '≋'];
}
const mapColors = ['#4e79a7', '#59a14f', '#e15759', '#b07aa1', '#f28e2b', '#76b7b2'];
function applyMindMapTransform() {
  if (state.mindMap.viewport) Object.assign(state.mindMap, TeamBrainTree.constrainMapView(state.mindMap, state.mindMap.viewport));
  const world = document.querySelector('.mindmap-world');
  if (world) world.style.transform = `translate(${state.mindMap.x}px,${state.mindMap.y}px) scale(${state.mindMap.scale})`;
  const percent = document.querySelector('[data-map-scale]');
  if (percent) percent.textContent = `${Math.round(state.mindMap.scale * 100)}%`;
  const zoomOut = document.querySelector('[data-map-control="out"]'), zoomIn = document.querySelector('[data-map-control="in"]');
  if (zoomOut) zoomOut.disabled = state.mindMap.scale <= (state.mindMap.viewport?.minScale || .35) + .001;
  if (zoomIn) zoomIn.disabled = state.mindMap.scale >= (state.mindMap.viewport?.maxScale || 1.65) - .001;
}
function mindMapNode(placed, rootId) {
  const event = placed.node.event, root = placed.id === rootId, [kind, label] = root ? ['root', 'ANA KONU'] : treeKind(event), childCount = placed.node.children.length;
  const colorClass = root ? 'branch-root' : `branch-${placed.branch % mapColors.length}`;
  const detail = event.body ? `<small>${escape(String(event.body).slice(0, 90))}</small>` : '';
  const canFocus = childCount > 0 && !root, cardAction = canFocus ? `data-tree-focus="${escape(placed.id)}"` : (root && placed.id === '__project__' ? '' : `data-event="${escape(placed.id)}"`);
  const count = placed.descendants ? `<span class="mindmap-count">${placed.descendants} alt kayıt${canFocus ? ' · dala gir →' : ''}</span>` : '<span class="mindmap-count">Ayrıntıyı aç →</span>';
  return `<div class="mindmap-node ${kind} ${root ? 'root' : ''} ${colorClass}" data-map-node="${escape(placed.id)}" data-map-x="${placed.x}" data-map-y="${placed.y}"><button class="mindmap-card" type="button" ${cardAction}><span class="mindmap-kicker">${label}</span><strong>${escape(event.title)}</strong>${root ? detail : ''}${count}</button>${canFocus ? `<button class="mindmap-info" type="button" data-event="${escape(placed.id)}" aria-label="${escape(event.title)} ayrıntısını aç" title="Ayrıntıyı aç">i</button>` : ''}</div>`;
}
function setupMindMapInteractions(layout) {
  const stage = document.querySelector('.mindmap-stage'), world = document.querySelector('.mindmap-world');
  if (!stage) return;
  const measure = () => {
    const centerX = stage.clientWidth / 2, centerY = stage.clientHeight / 2;
    const maxX = Math.max(...layout.nodes.map(node => Math.abs(node.x))) + 135, maxY = Math.max(...layout.nodes.map(node => Math.abs(node.y))) + 70;
    const fit = Math.max(.35, Math.min(1, (centerX - 18) / maxX, (centerY - 18) / maxY));
    state.mindMap.fit = fit;
    state.mindMap.viewport = { halfWidth: centerX, halfHeight: centerY, contentHalfWidth: maxX, contentHalfHeight: maxY, minScale: fit, maxScale: 1.5, padding: 18 };
    if (!state.mindMap.fitted) { state.mindMap.scale = fit; state.mindMap.fitted = true; }
    world.querySelectorAll('[data-map-node]').forEach(node => { node.style.left = `${centerX + Number(node.dataset.mapX)}px`; node.style.top = `${centerY + Number(node.dataset.mapY)}px`; });
    world.querySelectorAll('[data-edge-x1]').forEach(edge => { const x1 = Number(edge.dataset.edgeX1), y1 = Number(edge.dataset.edgeY1), dx = Number(edge.dataset.edgeX2) - x1, dy = Number(edge.dataset.edgeY2) - y1; edge.style.left = `${centerX + x1}px`; edge.style.top = `${centerY + y1}px`; edge.style.width = `${Math.hypot(dx, dy)}px`; edge.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`; });
    applyMindMapTransform();
  };
  measure(); requestAnimationFrame(measure);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(stage);
  let dragging = false, startX = 0, startY = 0, originX = 0, originY = 0;
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    const oldScale = state.mindMap.scale, minScale = state.mindMap.viewport?.minScale || .35;
    const newScale = Math.max(minScale, Math.min(1.5, oldScale * (event.deltaY > 0 ? .92 : 1.08)));
    const rect = stage.getBoundingClientRect(), pointerX = event.clientX - rect.left - rect.width / 2, pointerY = event.clientY - rect.top - rect.height / 2, ratio = newScale / oldScale;
    state.mindMap.x = pointerX - (pointerX - state.mindMap.x) * ratio;
    state.mindMap.y = pointerY - (pointerY - state.mindMap.y) * ratio;
    state.mindMap.scale = newScale;
    applyMindMapTransform();
  }, { passive: false });
  stage.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    dragging = true; startX = event.clientX; startY = event.clientY; originX = state.mindMap.x; originY = state.mindMap.y;
    stage.setPointerCapture(event.pointerId); stage.classList.add('dragging');
  });
  stage.addEventListener('pointermove', event => {
    if (!dragging) return;
    state.mindMap.x = originX + event.clientX - startX; state.mindMap.y = originY + event.clientY - startY; applyMindMapTransform();
  });
  const stopDragging = () => { dragging = false; stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', stopDragging);
  stage.addEventListener('pointercancel', stopDragging);
  stage.addEventListener('lostpointercapture', stopDragging);
  applyMindMapTransform();
}
function hierarchyNode(node, branch = 0, root = false) {
  const id = node.event.event_id, expanded = state.treeExpanded.has(id), childCount = node.children.length;
  const [kind, label] = root ? ['root', 'PROJE KÖKÜ'] : treeKind(node.event), colorClass = root ? 'branch-root' : `branch-${branch % mapColors.length}`;
  const detailAction = root ? '' : `data-event="${escape(id)}"`, body = root ? '<small>Tüm ana konular bu kökten dallanır.</small>' : '';
  const chevron = expanded ? '<svg class="tree-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 6 4.5 4 4.5-4"/></svg>' : '<svg class="tree-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3.5 4 4.5-4 4.5"/></svg>';
  const branchControl = childCount ? `<button class="hierarchy-toggle" type="button" data-tree-branch="${escape(id)}" aria-expanded="${String(expanded)}">${chevron}<span>${childCount} dalı ${expanded ? 'daralt' : 'aç'}</span></button>` : '<span class="hierarchy-leaf">Son kayıt</span>';
  const addParent = root ? '' : id;
  return `<li class="hierarchy-item ${colorClass}"><article class="hierarchy-node ${kind} ${root ? 'root' : ''}" data-tree-node="${escape(id)}"><button class="hierarchy-card" type="button" ${detailAction}><span class="mindmap-kicker">${label}</span><strong>${escape(node.event.title)}</strong>${body}<span class="hierarchy-count">${node.descendants} alt kayıt</span></button><div class="hierarchy-node-actions">${branchControl}<button type="button" class="hierarchy-add" data-tree-add="${escape(addParent)}" aria-label="${escape(node.event.title)} altına kayıt ekle" title="Alt kayıt ekle">＋</button></div></article>${childCount && expanded ? `<ul>${node.children.map((child, index) => hierarchyNode(child, root ? index : branch, false)).join('')}</ul>` : ''}</li>`;
}
function projectHierarchy() {
  return TeamBrainTree.buildProjectTree(TeamBrainTree.buildForest(events()).forest, state.snapshot?.project?.name || 'Proje');
}
function hierarchyAnchor(root, id) {
  return [...(root?.querySelectorAll('[data-tree-node]') || [])].find(node => node.dataset.treeNode === id);
}
function applyHierarchyScale() {
  const tree = document.querySelector('.hierarchy-tree');
  if (tree) tree.style.zoom = String(state.treeScale);
  const label = document.querySelector('[data-tree-scale]');
  if (label) label.textContent = `${Math.round(state.treeScale * 100)}%`;
  document.querySelectorAll('[data-tree-zoom]').forEach(button => {
    button.disabled = (button.dataset.treeZoom === 'out' && state.treeScale <= .7) || (button.dataset.treeZoom === 'in' && state.treeScale >= 1.4);
  });
}
function setHierarchyScale(nextScale) {
  const scroll = document.querySelector('.hierarchy-scroll');
  const previous = state.treeScale;
  const next = Math.max(.7, Math.min(1.4, Math.round(nextScale * 10) / 10));
  if (!scroll || previous === next) return;
  const centerX = (scroll.scrollLeft + scroll.clientWidth / 2) / previous;
  const centerY = (scroll.scrollTop + scroll.clientHeight / 2) / previous;
  state.treeScale = next;
  applyHierarchyScale();
  scroll.scrollLeft = centerX * next - scroll.clientWidth / 2;
  scroll.scrollTop = centerY * next - scroll.clientHeight / 2;
}
function rerenderHierarchy(anchorId) {
  const scroll = document.querySelector('.hierarchy-scroll');
  if (!scroll) return renderTree();
  const currentAnchor = hierarchyAnchor(scroll, anchorId);
  const previousRect = currentAnchor?.getBoundingClientRect();
  const previousLeft = scroll.scrollLeft, previousTop = scroll.scrollTop;
  scroll.innerHTML = `<ul class="hierarchy-tree">${hierarchyNode(projectHierarchy(), 0, true)}</ul>`;
  applyHierarchyScale();
  const nextAnchor = hierarchyAnchor(scroll, anchorId);
  if (previousRect && nextAnchor) {
    const nextRect = nextAnchor.getBoundingClientRect();
    scroll.scrollLeft += nextRect.left - previousRect.left;
    scroll.scrollTop += nextRect.top - previousRect.top;
  } else {
    scroll.scrollLeft = previousLeft;
    scroll.scrollTop = previousTop;
  }
}
function updateTreeFullscreenButton() {
  const button = document.querySelector('[data-tree-fullscreen]');
  if (!button) return;
  const active = document.fullscreenElement?.classList.contains('hierarchy-shell');
  button.querySelector('[data-fullscreen-label]').textContent = active ? 'Tam ekrandan çık' : 'Tam ekran';
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Ağaç tam ekranından çık' : 'Ağacı tam ekrana al');
}
document.addEventListener('fullscreenchange', updateTreeFullscreenButton);
function renderTree() {
  const model = TeamBrainTree.buildForest(events());
  if (!model.stats.records) {
    $('content').innerHTML = `<section class="panel">${empty('Ağaç ilk kaydı bekliyor.', 'Yeni bir kayıt ekleyin; sonraki kayıtları “Hangi kayda dayanıyor?” alanıyla ona bağlayın.', { id: 'event', text: '＋ İlk kaydı ekle' })}</section>`;
    return;
  }
  const tree = TeamBrainTree.buildProjectTree(model.forest, state.snapshot?.project?.name || 'Proje');
  if (state.treeInitializedProject !== state.project) {
    state.treeExpanded = new Set(['__project__', ...tree.children.map(node => node.event.event_id)]);
    state.treeInitializedProject = state.project;
  }
  $('content').innerHTML = `<div class="tree-toolbar"><div><span class="eyebrow">KÖK · DAL · ALT DAL</span><h2>${model.stats.records} kayıt · ${model.stats.roots} ana dal</h2><p>Her kayıt yalnızca gerçek üst konusunun altında yer alır.</p></div><div class="tree-actions"><button class="secondary" type="button" data-tree-reset>Ana dallara dön</button><button class="primary" type="button" data-tree-add="">＋ Ana konu ekle</button></div></div><section class="hierarchy-shell"><div class="hierarchy-guide"><span>Yukarıdan aşağı · genelden özele</span><div class="hierarchy-tools"><div class="hierarchy-zoom" role="group" aria-label="Ağaç yakınlaştırma"><button type="button" data-tree-zoom="out" aria-label="Uzaklaştır">−</button><button type="button" class="hierarchy-scale" data-tree-zoom="reset" data-tree-scale aria-label="Yakınlaştırmayı sıfırla">100%</button><button type="button" data-tree-zoom="in" aria-label="Yakınlaştır">＋</button></div><button type="button" class="hierarchy-fullscreen" data-tree-fullscreen aria-label="Ağacı tam ekrana al" aria-pressed="false"><svg class="fullscreen-icon fullscreen-enter" viewBox="0 0 18 18" aria-hidden="true"><path d="M7 3H3v4M11 3h4v4M15 11v4h-4M7 15H3v-4"/></svg><svg class="fullscreen-icon fullscreen-exit" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 7h4V3M15 7h-4V3M11 15v-4h4M7 15v-4H3"/></svg><span data-fullscreen-label>Tam ekran</span></button></div></div><div class="hierarchy-scroll"><ul class="hierarchy-tree">${hierarchyNode(tree, 0, true)}</ul></div></section>`;
  applyHierarchyScale();
  updateTreeFullscreenButton();
}
function renderChat() {
  const messages = chatEvents();
  const github = state.snapshot?.connection?.github;
  const sharing = github?.connected ? (github.sync === 'background' ? 'GitHub’a otomatik gönderiliyor' : 'GitHub’a manuel senkron bekliyor') : team()?.github_repo ? 'GitHub memory reposuna bağlı' : 'GitHub bağlantısı kurulmadı';
  const privacy = 'Ekip içi sohbet; Obsidian bilgi kayıtlarına dahil edilmez.';
  const scopeButtons = `<div class="calendar-actions chat-switch" role="group" aria-label="Sohbet alanı"><button class="${state.chatScope === 'team' ? 'primary' : 'secondary'}" type="button" data-chat-scope="team">Ekip sohbeti</button><button class="${state.chatScope === 'project' ? 'primary' : 'secondary'}" type="button" data-chat-scope="project">Proje sohbeti</button></div>`;
  $('content').innerHTML = `<section class="chat-panel"><div class="chat-history" id="chat-history"><div class="panel-head chat-context"><div><strong>${state.chatScope === 'team' ? 'Ekip sohbeti' : 'Proje sohbeti'}</strong><small>${state.chatScope === 'team' ? 'Tüm ekip üyeleriyle ortak konuşma' : 'Yalnızca seçili projenin bağlamı'} · ${escape(sharing)} · ${privacy}</small></div>${scopeButtons}</div>${messages.map(chatBubble).join('') || empty(state.chatScope === 'team' ? 'Ekip sohbeti henüz boş.' : 'Bu projede sohbet yok.', state.chatScope === 'team' ? 'Ekip arkadaşlarına ilk mesajı bırak.' : 'Proje bağlamı hakkında soru sor veya not bırak.')}</div><form id="chat-form" class="chat-composer"><label class="sr-only" for="chat-message">Mesaj</label><textarea id="chat-message" name="message" maxlength="50000" placeholder="${state.chatScope === 'team' ? 'Ekip arkadaşlarına mesaj yaz…' : 'Bu projenin bağlamını sor…'}"></textarea><button class="primary" id="send-chat">Gönder</button></form></section><div class="link-status">${privacy} Sohbet, incelenmiş shared kayıtlarından ayrı collaboration alanında tutulur. ${escape(sharing)}.</div>`;
  const history = $('chat-history');
  history.scrollTop = history.scrollHeight;
  $('chat-form').addEventListener('submit', submitChat);
  document.querySelectorAll('[data-chat-scope]').forEach(button => button.addEventListener('click', async () => { state.chatScope = button.dataset.chatScope; if (state.chatScope === 'team') await loadTeamChat(); render(); }));
  $('chat-message').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      $('chat-form').requestSubmit();
    }
  });
}
function chatBubble(event) {
  const reply = event.event_type === 'chat.reply.generated';
  return `<article class="chat-bubble ${reply ? 'assistant' : 'user'}"><span class="chat-role">${reply ? 'TeamBrain' : `Gönderen · ${escape(event.actor_id || 'Bilinmeyen kullanıcı')}`}</span><span class="chat-text">${escape(event.body)}</span><time>${date(event.created_at)} · ${time(event.created_at)}</time></article>`;
}
async function submitChat(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = new FormData(form).get('message');
  if (!String(message || '').trim()) return;
  setButtonBusy($('send-chat'), true, 'Gönderiliyor');
  try {
    if (state.chatScope === 'team') { await api(`/api/teams/${state.team}/chat`, { message, actor: state.snapshot?.actor }); await loadTeamChat(); render(); }
    else await api(base() + '/chat', { message });
    form.reset();
    await loadProject();
  } catch (error) {
    toast(error.message);
  } finally {
    setButtonBusy($('send-chat'), false);
  }
}
function renderActivity() {
  $('content').innerHTML = `<div class="toolbar"><label class="sr-only" for="search">Kayıtlarda ara</label><input id="search" type="search" value="${escape(state.query)}" placeholder="Başlık veya açıklamada ara…"><label class="sr-only" for="filter">Kayıt türü</label><select id="filter"><option value="">Tüm türler</option>${Object.entries(names).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><button class="secondary" data-action="refresh">Yenile</button></div><section class="panel"><div class="feed" id="results"></div></section><p class="detail-meta">En yeni ${events().length} / ${state.snapshot.total} kayıt gösteriliyor.</p>`;
  $('filter').value = state.type;
  $('search').addEventListener('input', e => { state.query = e.target.value; renderList(); });
  $('filter').addEventListener('change', e => { state.type = e.target.value; renderList(); });
  renderList();
}
function renderConnections() {
  $('content').innerHTML = `<div class="connections">${[['Git paylaşımı', 'Manuel CLI', 'Ekip paylaşımı için projeye özel bir memory deposu gerekir. Otomatik senkronizasyon ve arayüzden remote kurulumu henüz uygulanmadı.'], ['Chat sağlayıcıları', 'Yerel motor aktif', 'Codex, Claude veya Ollama adapterları aynı chat kontratına bağlanacak şekilde ayrıldı.'], ['Serena', 'Bağlı değil', 'Sembol ve kod etkisi analizleri için planlanan bağlantı. Mevcut adapter yalnızca verilen analiz verisini dönüştürür.'], ['Obsidian', 'Markdown uyumlu', 'Projenin memory klasöründeki kayıtlar okunabilir. Özel Obsidian eklentisi henüz bulunmuyor.']].map(([name, status, text]) => `<section class="panel connection"><h3>${name}</h3><span class="badge">${status}</span><p>${text}</p></section>`).join('')}</div><div class="link-status">Arama indeksini kayıtlardan yeniden kurabilirsin. <button class="secondary" data-action="reindex">İndeksi yenile</button></div>`;
}
function editor(mode) {
  if (mode === 'project' && !state.team) mode = 'team';
  state.mode = mode;
  $('form-error').textContent = '';
  $('editor-title').textContent = { team: 'Yeni bir ekip oluştur', project: 'Ekibine bir proje ekle', event: 'Birlikte hatırlanacak bir kayıt' }[mode];
  $('fields').innerHTML = mode === 'event' ? `<label for="event-type">Kayıt türü</label><select id="event-type" name="event_type">${Object.entries(names).filter(([v]) => !v.startsWith('chat.')).slice(0, 7).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><label for="event-title">Başlık</label><input id="event-title" name="title" maxlength="200" required placeholder="Örn. İletişim için CAN bus seçildi"><label for="event-body">Ne oldu, neden önemli?</label><textarea id="event-body" name="body" maxlength="50000" placeholder="Gerekçeyi ve değerlendirdiğiniz alternatifleri ekleyin."></textarea><label for="cause">Üst konu</label><select id="cause" name="causation_id"><option value="">Bağımsız ana konu</option>${events().filter(e => !e.event_type.startsWith('chat.')).map(e => `<option value="${escape(e.event_id)}">${escape(e.title)}</option>`).join('')}</select><p class="detail-meta">Genelden özele ilerlemek için bu kaydın bağlı olduğu üst konuyu seç.</p>` : mode === 'team' ? `<input name="local_only" type="hidden" value="true"><label for="entity-name">Alan adı</label><input id="entity-name" name="name" maxlength="100" required placeholder="Örn. Kişisel projelerim"><p class="detail-meta">GitHub olmadan da yerel ikinci beynini oluşturabilirsin. Klasörler ve kayıtlar otomatik hazırlanır.</p><label for="github-url">GitHub ekip reposu <span class="record-meta">(isteğe bağlı)</span></label><input id="github-url" name="github_url" type="url" placeholder="https://github.com/organizasyon/ekip-reposu"><p class="detail-meta">Boş bırakırsan alan yalnızca bu bilgisayarda kalır; GitHub’a veri gönderilmez. Repo eklersen ekip paylaşımı için doğrulanır.</p>` : `<label for="entity-name">Proje adı</label><input id="entity-name" name="name" maxlength="100" required placeholder="Örn. Robot kontrol sistemi"><p class="detail-meta">Bu proje seçili ekibe ait olacak ve ayrı bir kayıt geçmişi tutacak.</p>`;
  if (mode === 'team') $('github-url').addEventListener('input', event => { try { const match = event.target.value.match(/github\.com[/:][^/]+\/([^/]+?)(?:\.git)?\/?$/i); if (match && !$('entity-name').value) $('entity-name').value = match[1].replace(/[-_]+/g, ' '); } catch {} });
  $('editor').showModal();
  $('fields').querySelector('input, textarea')?.focus();
}
async function detail(eventId) {
  const event = events().find(e => e.event_id === eventId);
  if (!event) return;
  $('detail-content').innerHTML = `<span class="badge">${escape(names[event.event_type] || event.event_type)}</span><h2>${escape(event.title)}</h2><p class="detail-meta">${escape(event.actor_id)} · ${date(event.created_at)}</p><div class="detail-body">${escape(event.body || 'Açıklama eklenmemiş.')}</div><h3>Kararın izleri</h3><div id="chain">Yükleniyor…</div><p class="detail-meta">Kayıt kimliği: ${escape(event.event_id)}</p>`;
  $('detail').showModal();
  try {
    const chain = await api(base() + '/chain?event=' + encodeURIComponent(eventId));
    $('chain').innerHTML = chain.map(e => `<div class="chain-item">${escape(e.title)}<small>${escape(names[e.event_type] || e.event_type)} · ${date(e.created_at)}</small></div>`).join('');
  } catch (error) {
    $('chain').textContent = error.message;
  }
}
$('team').addEventListener('change', async e => { state.team = e.target.value; state.project = team()?.projects[0]?.id || null; state.query = ''; state.treeInitializedProject = null; rememberSelection(); choose(); await loadTeamChat(); await loadProject(); });
$('projects').addEventListener('click', async e => { const b = e.target.closest('[data-project]'); if (b) { state.project = b.dataset.project; if (state.view === 'projects') state.view = 'overview'; state.query = ''; state.type = ''; state.treeInitializedProject = null; rememberSelection(); choose(); await loadProject(); } });
$('browse-projects').addEventListener('click', () => { state.view = 'projects'; state.query = ''; state.type = ''; render(); });
$('nav').addEventListener('click', async e => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; state.query = ''; state.type = ''; markViewSeen(); if (state.view === 'vault') await loadVault(); else render(); } });
$('content').addEventListener('click', async e => {  const calendarNav = e.target.closest('[data-calendar-nav]')?.dataset.calendarNav;
  const vaultEntry = e.target.closest('[data-vault-entry]');
  if (vaultEntry) { showVaultDetail(vaultEntry.dataset.vaultEntry); return; }
  const fullscreenButton = e.target.closest('[data-tree-fullscreen]');
  if (fullscreenButton) { try { if (document.fullscreenElement) await document.exitFullscreen(); else await fullscreenButton.closest('.hierarchy-shell')?.requestFullscreen(); } catch { toast('Tam ekran açılamadı. Tarayıcı izinlerini kontrol edin.'); } return; }
  const treeZoom = e.target.closest('[data-tree-zoom]');
  if (treeZoom) { const action = treeZoom.dataset.treeZoom; setHierarchyScale(action === 'reset' ? 1 : state.treeScale + (action === 'in' ? .1 : -.1)); return; }
  const treeBranch = e.target.closest('[data-tree-branch]');
  if (treeBranch) { const id = treeBranch.dataset.treeBranch; if (state.treeExpanded.has(id)) state.treeExpanded.delete(id); else state.treeExpanded.add(id); rerenderHierarchy(id); return; }
  if (e.target.closest('[data-tree-reset]')) { const tree = projectHierarchy(); state.treeExpanded = new Set(['__project__', ...tree.children.map(node => node.event.event_id)]); rerenderHierarchy('__project__'); return; }
  const treeAdd = e.target.closest('[data-tree-add]');
  if (treeAdd) { state.treeParent = treeAdd.dataset.treeAdd || null; editor('event'); if (state.treeParent && $('cause')) $('cause').value = state.treeParent; return; }
  const projectCard = e.target.closest('[data-project-open]');
  if (projectCard) { state.project = projectCard.dataset.projectOpen; state.view = 'overview'; state.query = ''; state.type = ''; state.treeInitializedProject = null; rememberSelection(); choose(); await loadProject(); return; }
  if (calendarNav) { const cursor = state.calendarCursor || new Date(); if (calendarNav === 'today') state.calendarCursor = new Date(); else state.calendarCursor = new Date(cursor.getFullYear(), cursor.getMonth() + (calendarNav === 'next' ? 1 : -1), 1); render(); return; }
  const calendarDay = e.target.closest('[data-calendar-date]');
  if (calendarDay) {
    state.selectedCalendarDate = calendarDay.dataset.calendarDate;
    document.querySelectorAll('[data-calendar-date]').forEach(day => day.classList.toggle('selected', day === calendarDay));
    const hint = document.querySelector('.calendar-heading p');
    if (hint) hint.textContent = `${new Date(`${state.selectedCalendarDate}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} seçildi · Etkinlik eklemek için çift tıkla`;
    return;
  }
  const event = e.target.closest('[data-event]');
  if (event) { await detail(event.dataset.event); return; }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (['team', 'project', 'event'].includes(action)) { if (action === 'event') state.treeParent = null; editor(action); }
  if (action === 'calendar' || action === 'task') plannerEditor(action);
  if (action === 'activity') { state.view = 'activity'; markViewSeen(); render(); }
  if (action === 'refresh') await loadProject();
  if (action === 'vault-refresh') { state.vault = null; await loadVault(true); }
  if (action === 'refresh-members') { const button = e.target.closest('[data-action]'); setButtonBusy(button, true, 'Yenileniyor'); try { const result = await api(`/api/teams/${state.team}/members`, {}, 'POST'); toast(`${result.members.length} GitHub üyesi güncellendi.`); await reloadTeams(); } catch (error) { toast(error.message); } finally { setButtonBusy(button, false); } }
  if (action === 'local-setup') await showSetupGuide(state.team);
  const taskButton = e.target.closest('[data-task]');
  if (taskButton) { setButtonBusy(taskButton, true, ''); try { await api(base() + '/tasks/' + encodeURIComponent(taskButton.dataset.task), { status: taskButton.closest('.task-item').classList.contains('done') ? 'open' : 'done' }, 'PATCH'); await loadProject(); } catch (error) { toast(error.message); setButtonBusy(taskButton, false); } return; }
  if (action === 'reindex') { const button = e.target.closest('[data-action]'); setButtonBusy(button, true, 'Yenileniyor'); try { const result = await api(base() + '/reindex', {}); toast(`${result.indexed} kayıt indekslendi.`); await loadProject(); } catch (error) { toast(error.message); } finally { setButtonBusy(button, false); } }
});
$('content').addEventListener('dblclick', e => {
  const calendarDay = e.target.closest('[data-calendar-date]');
  if (!calendarDay) return;
  e.preventDefault();
  state.selectedCalendarDate = calendarDay.dataset.calendarDate;
  plannerEditor('calendar', state.selectedCalendarDate);
});
$('add-team').onclick = () => editor('team');
$('remove-team').onclick = async () => {
  const current = team(); if (!current) return;
  const hasProjects = current.projects?.filter(project => project.id !== 'legacy').length > 0;
  const promptText = hasProjects ? `Bu ekipte proje var. Silmek için ekip adını aynen yazın: ${current.name}` : `“${current.name}” ekibi silinsin mi?`;
  const confirmation = hasProjects ? window.prompt(promptText) : (window.confirm(promptText) ? current.name : '');
  if (!confirmation) return;
  try { await api(`/api/teams/${current.id}`, { confirmation }, 'DELETE'); state.team = null; state.project = null; state.snapshot = null; toast('Ekip silindi.'); await reloadTeams(); } catch (error) { toast(error.message); }
};
$('close-setup').onclick = () => $('setup-guide').close();
$('notifications-toggle').onclick = event => {
  event.stopPropagation();
  const panel = $('notifications-panel'), open = panel.hidden;
  panel.hidden = !open;
  $('notifications-toggle').setAttribute('aria-expanded', String(open));
  if (open) { renderNotificationCenter(); markNotificationSectionSeen(state.notificationSection); }
};
$('close-notifications').onclick = () => { $('notifications-panel').hidden = true; $('notifications-toggle').setAttribute('aria-expanded', 'false'); };
document.querySelectorAll('[data-notification-section]').forEach(button => button.onclick = event => {
  event.stopPropagation();
  state.notificationSection = button.dataset.notificationSection;
  markNotificationSectionSeen(state.notificationSection);
});
$('notifications-list').addEventListener('click', async event => {
  const setup = event.target.closest('[data-notification-setup]');
  if (setup) { $('close-notifications').click(); await showSetupGuide(setup.dataset.notificationSetup); return; }
  const target = event.target.closest('[data-notification-team]');
  if (target) {
    state.team = target.dataset.notificationTeam;
    state.project = target.dataset.notificationProject || state.teams.find(item => item.id === state.team)?.projects?.[0]?.id || null;
    if (target.dataset.notificationView) state.view = target.dataset.notificationView;
    if (target.dataset.notificationChatScope) state.chatScope = target.dataset.notificationChatScope;
    rememberSelection(); choose();
    await loadTeamChat(); await loadProject();
    markViewSeen(); render(); $('close-notifications').click();
    if (target.dataset.notificationEvent) await detail(target.dataset.notificationEvent);
    return;
  }
  const eventButton = event.target.closest('[data-notification-event]');
  if (eventButton) { $('close-notifications').click(); await detail(eventButton.dataset.notificationEvent); return; }
  const viewButton = event.target.closest('[data-notification-view]');
  if (viewButton) {
    if (viewButton.dataset.notificationChatScope) state.chatScope = viewButton.dataset.notificationChatScope;
    state.view = viewButton.dataset.notificationView;
    markViewSeen();
    $('close-notifications').click();
    render();
  }
});
document.addEventListener('click', event => {
  if (!$('notifications-panel').hidden && !event.target.closest('.notification-center')) $('close-notifications').click();
});
$('upload-document').onclick = () => $('document-file').click();
$('document-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file || !state.team || !state.project) return;
  const form = new FormData(); form.append('file', file);
  setButtonBusy($('upload-document'), true, 'Yükleniyor');
  try {
    const response = await fetch(`/api/teams/${state.team}/projects/${state.project}/documents`, { method: 'POST', body: form });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Belge yüklenemedi.');
    toast(`Belge Markdown olarak kaydedildi: ${result.filename}`); await loadProject();
  } catch (error) { toast(error.message); } finally { event.target.value = ''; setButtonBusy($('upload-document'), false); }
});
$('add-project').onclick = () => editor('project');
$('new-event').onclick = () => editor('event');
$('hero-action').onclick = () => editor(!state.team ? 'team' : !state.project ? 'project' : 'event');
$('close-editor').onclick = $('cancel').onclick = () => $('editor').close();
$('close-detail').onclick = () => $('detail').close();
$('editor-form').addEventListener('submit', async e => {
  e.preventDefault();
  setButtonBusy($('save'), true, state.mode === 'task' ? 'Atanıyor' : 'Kaydediliyor');
  $('form-error').textContent = '';
  const input = Object.fromEntries(new FormData(e.target));
  try {
    let createdTeam = null;
    if (state.mode === 'team') { createdTeam = await api('/api/teams', input); state.team = createdTeam.id; state.project = null; }
    else if (state.mode === 'project') { const result = await api(`/api/teams/${state.team}/projects`, input); state.project = result.id; }
    else if (state.mode === 'calendar') await api(base() + '/calendar', input);
    else if (state.mode === 'task') await api(base() + '/tasks', input);
    else await api(base() + '/events', input);
    $('editor').close();
    toast('Kaydedildi.');
    await reloadTeams();
    if (state.mode === 'team') {
      if (createdTeam?.github_repo) await showSetupGuide(state.team);
      else { toast('Kişisel yerel alan oluşturuldu. İlk projenizi ekleyebilirsiniz.'); editor('project'); }
    }
  } catch (error) {
    $('form-error').textContent = error.message;
  } finally {
    setButtonBusy($('save'), false);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('notifications-panel').hidden) { $('close-notifications').click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); state.view = 'activity'; markViewSeen(); render(); $('search')?.focus(); }
});

let updatePollRunning = false;
async function pollIncomingUpdates() {
  if (updatePollRunning || document.hidden || !state.team) return;
  updatePollRunning = true;
  const selectedTeam = state.team, selectedProject = state.project;
  try {
    const requests = [api('/api/teams'), api(`/api/teams/${selectedTeam}/chat`), api('/api/sync'), api('/api/notifications')];
    if (selectedProject) requests.push(api(`/api/teams/${selectedTeam}/projects/${selectedProject}`));
    const results = await Promise.all(requests); let teams = results[0]; const teamChat = results[1], syncHealth = results[2], notificationWorkspace = results[3], snapshot = selectedProject ? results[4] : null;
    if (state.team !== selectedTeam || state.project !== selectedProject) return;
    const selected = teams.find(item => item.id === selectedTeam);
    if (selected?.github_repo && Date.now() - (state.memberRefresh[selectedTeam] || 0) > 5 * 60 * 1000) {
      state.memberRefresh[selectedTeam] = Date.now();
      try { await api(`/api/teams/${selectedTeam}/members`, {}, 'POST'); teams = await api('/api/teams'); } catch {}
    }
    state.teams = teams;
    state.teamChat = teamChat;
    state.syncHealth = syncHealth;
    state.notificationWorkspace = notificationWorkspace;
    if (snapshot) state.snapshot = snapshot;
    choose();
    const userIsTyping = document.activeElement?.matches('input, textarea, select') || $('editor').open || $('detail').open;
    observeNotifications(!userIsTyping && ['team', 'chat', 'activity', 'decisions', 'calendar', 'tasks'].includes(state.view));
    if (!userIsTyping) render();
  } catch { /* The next poll retries; normal work should not be interrupted. */ }
  finally { updatePollRunning = false; }
}

checkForUpdate();
setInterval(checkForUpdate, 30 * 60 * 1000);
setInterval(pollIncomingUpdates, 20 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollIncomingUpdates(); });
reloadTeams().catch(error => { $('content').textContent = 'Bağlantı kurulamadı: ' + error.message; toast(error.message); });

// The connection view reflects the selected memory repository instead of a hard-coded preview state.
function renderConnections() {
  const c = state.snapshot?.connection || {};
  const github = c.github?.connected ? `Bağlı · ${escape(c.github.actor_id || 'kimlik yok')}` : 'Bağlı değil';
  const sync = state.syncHealth || {}, syncLabel = !sync.enabled ? 'MANUEL' : sync.state === 'synced' && sync.verified_remote ? 'DOĞRULANDI' : sync.state === 'attention-required' ? 'MÜDAHALE GEREKLİ' : 'GÖNDERİM BEKLİYOR';
  const syncText = !sync.enabled ? 'Otomatik gönderim kapalı.' : sync.state === 'synced' && sync.verified_remote ? `GitHub teslimatı doğrulandı${sync.commit ? ` · ${escape(sync.commit.slice(0, 12))}` : ''}.` : `${escape(sync.message || 'Senkronizasyon henüz doğrulanmadı.')} Bekleyen değişiklik: ${Number(sync.pending_changes || 0)}.`;
  const serena = c.serena?.configured ? 'Proje yapılandırması bulundu' : 'Yerel kod projesinde etkinleştirilmeli';
  const cards = [
    ['Git paylaşımı', github, c.github?.connected ? `Remote: ${escape(c.github.remote || '')}. Pull/push işlemleri açık ve bilinçlidir.` : 'Memory reposunu SETUP.md veya connect github komutuyla bağla.'],
    ['Otomatik teslimat', syncLabel, syncText],
    ['Chat sağlayıcıları', 'Yerel motor aktif', 'Sohbet yerel TeamBrain kayıtlarını arar; harici AI sağlayıcısı otomatik çağrılmaz.'],
    ['Serena', serena, 'Serena yalnızca kod sembolleri ve güvenli refactor içindir; ekip hafızasının sahibi değildir.'],
    ['AvenoxBeyin', 'Özel / manuel aktarım', 'Kişisel vault otomatik okunmaz. Yalnızca gizlilikten geçirilmiş özet aktarılır.'],
    ['Obsidian', 'Markdown uyumlu', 'Bu memory reposunu Obsidian ile açabilirsin; SQLite ve generated görünümler paylaşılmaz.']
  ];
  const update = state.updateInfo, installation = update?.installation;
  const updateTone = update?.restart_required ? 'installed' : update?.available ? 'attention' : update?.offline ? 'offline' : 'current';
  const updateLabel = !update ? 'KONTROL EDİLİYOR' : update.restart_required ? 'YENİDEN BAŞLAT' : update.available ? `${update.latest} HAZIR` : update.offline ? 'ÇEVRİMDIŞI' : 'GÜNCEL';
  const updateText = !update ? 'GitHub sürüm bilgisi alınıyor.' : update.restart_required ? `TeamBrain ${update.current} diske kuruldu; çalışan dashboard hâlâ ${update.running_version}.` : update.available ? `${update.current} → ${update.latest}. ${installation?.dirty ? 'Uygulama klasöründe yerel değişiklik olduğu için güvenli kurulum durduruldu.' : installation?.supported ? 'Resmi yayın doğrulanıp fast-forward olarak kurulabilir.' : installation?.reason || 'Sürüm sayfasından elle güncelleyin.'}` : update.offline ? 'GitHub’a erişilemedi; mevcut sürüm çalışmaya devam ediyor.' : `TeamBrain ${update.current} en son yayınla eşleşiyor.`;
  const updateActions = `<div class="update-actions"><button class="secondary" type="button" data-update-check>Güncellemeleri kontrol et</button>${update?.available && installation?.supported && !installation?.dirty ? '<button class="primary" type="button" data-update-apply>Şimdi güncelle</button>' : ''}${update?.restart_required ? '<button class="primary" type="button" data-update-restart>Yeniden başlat</button>' : ''}<button class="secondary" type="button" data-update-auto>${update?.automatic ? 'Otomatik güncellemeyi kapat' : 'Otomatik güncellemeyi aç'}</button></div>`;
  $('content').innerHTML = `<section class="panel update-panel ${updateTone}"><div><span class="eyebrow">UYGULAMA GÜNCELLEMELERİ</span><h3>TeamBrain’i güncel ve güvenli tut</h3><p>${escape(updateText)}</p></div><span class="badge">${escape(updateLabel)}</span>${updateActions}</section><div class="connections">${cards.map(([name,status,text]) => `<section class="panel connection"><h3>${name}</h3><span class="badge">${status}</span><p>${text}</p></section>`).join('')}</div><div class="link-status">Bağlantı değiştiyse TeamBrain’i yeniden başlat. <button class="secondary" data-action="reindex">İndeksi yenile</button></div>`;
  document.querySelector('.update-panel [data-update-check]')?.addEventListener('click', event => { const button = event.currentTarget; setButtonBusy(button, true, 'Kontrol ediliyor'); checkForUpdate(true).finally(() => setButtonBusy(button, false)); });
  document.querySelector('.update-panel [data-update-apply]')?.addEventListener('click', event => applyAvailableUpdate(event.currentTarget));
  document.querySelector('.update-panel [data-update-restart]')?.addEventListener('click', event => restartAfterUpdate(event.currentTarget));
  document.querySelector('.update-panel [data-update-auto]')?.addEventListener('click', event => setAutomaticUpdates(!state.updateInfo?.automatic, event.currentTarget));
}
