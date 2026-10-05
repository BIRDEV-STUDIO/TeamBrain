'use strict';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { teams: [], team: null, project: null, snapshot: null, teamChat: [], actors: [], memberRefresh: {}, chatScope: 'team', view: 'overview', calendarCursor: new Date(), selectedCalendarDate: null, notificationSection: 'general', updateInfo: null, query: '', type: '', mode: null, version: 0 };
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
const views = { overview: 'Genel bakış', team: 'Ekip', chat: 'Sohbet', activity: 'Aktivite', decisions: 'Karar defteri', calendar: 'Takvim', tasks: 'Görevler', daily: 'Günün özeti', integrations: 'Bağlantılar' };
const date = value => new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const time = value => new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const today = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
$('date').textContent = today.toLocaleUpperCase('tr-TR');
const savedTheme = localStorage.getItem('teambrain-theme');
if (savedTheme === 'dark' || (!savedTheme && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
function updateThemeButton() { const dark=document.documentElement.classList.contains('dark'); $('theme-toggle').textContent=dark?'☾':'☀'; $('theme-toggle').setAttribute('aria-label',dark?'Açık moda geç':'Koyu moda geç'); }
updateThemeButton();
$('theme-toggle').addEventListener('click',()=>{const dark=document.documentElement.classList.toggle('dark'); localStorage.setItem('teambrain-theme',dark?'dark':'light'); updateThemeButton();});
async function checkForUpdate() {
  try {
    const update = await api('/api/update'); const notice = $('update-notice');
    state.updateInfo = update.available ? update : null;
    renderNotificationCenter();
    if (!update.available || localStorage.getItem('teambrain-dismissed-update') === update.latest) { notice.hidden = true; return; }
    notice.innerHTML = `<span>Yeni TeamBrain sürümü hazır: <strong>${escape(update.name || update.latest)}</strong> · Mevcut sürüm ${escape(update.current)}</span><span><a href="${escape(update.url)}" target="_blank" rel="noreferrer">Sürüm notlarını aç ↗</a> <button type="button" id="dismiss-update" aria-label="Bildirimi kapat">×</button></span>`;
    notice.hidden = false; $('dismiss-update').onclick = () => { localStorage.setItem('teambrain-dismissed-update', update.latest); notice.hidden = true; renderNotificationCenter(); };
  } catch {}
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
  if (!team()) {
    state.team = state.teams.find(item => item.id === savedTeam)?.id
      || state.teams.find(item => item.projects?.length)?.id
      || state.teams[0]?.id
      || null;
  }
  const projects = team()?.projects || [];
  if (!projects.some(project => project.id === state.project)) {
    state.project = projects.find(project => project.id === savedProject)?.id || projects[0]?.id || null;
  }
  rememberSelection();
}

function teamNotificationScope() { return state.team ? `team:${state.team}` : null; }
function projectNotificationScope() { return state.team && state.project ? `team:${state.team}:project:${state.project}` : null; }
function ownActors() { return [...state.actors, state.snapshot?.actor, state.snapshot?.connection?.github?.actor_id].filter(Boolean); }
function notificationItems() {
  const currentTeam = team();
  const baselineActor = ownActors()[0] || '__teambrain_self__';
  const teamItems = [
    { category: 'team', id: 'baseline:team', actor: baselineActor },
    { category: 'chat', id: 'baseline:chat', actor: baselineActor },
    ...(currentTeam?.members || []).map(member => ({ category: 'team', id: `member:${member.login}`, actor: member.login })),
    ...state.teamChat.filter(event => event.event_type === 'chat.message').map(event => ({ category: 'chat', id: `team-chat:${event.event_id}`, actor: event.actor_id }))
  ];
  const projectItems = ['chat', 'activity', 'decisions', 'calendar', 'tasks'].map(category => ({ category, id: `baseline:${category}`, actor: baselineActor }));
  projectItems.push(...events().filter(event => event.event_type !== 'chat.reply.generated').map(event => ({
    category: event.event_type === 'chat.message' ? 'chat' : event.event_type.startsWith('decision.') ? 'decisions' : 'activity',
    id: `event:${event.event_id}`,
    actor: event.actor_id
  })));
  for (const item of state.snapshot?.planner?.calendar || []) projectItems.push({ category: 'calendar', id: `calendar:${item.id}`, actor: item.created_by });
  for (const item of state.snapshot?.planner?.tasks || []) {
    projectItems.push({ category: 'tasks', id: `task:${item.id}:created`, actor: item.created_by });
    if (item.completed_at) projectItems.push({ category: 'tasks', id: `task:${item.id}:done:${item.completed_at}`, actor: item.completed_by });
  }
  return { teamItems, projectItems };
}
function markViewSeen(view = state.view) {
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
  const teamCounts = notificationTracker.counts(teamNotificationScope());
  const projectCounts = notificationTracker.counts(projectNotificationScope());
  const updateUnread = state.updateInfo && localStorage.getItem('teambrain-notification-update-seen') !== state.updateInfo.latest ? 1 : 0;
  const setupUnread = state.team && localStorage.getItem(setupSeenKey()) !== 'true' ? 1 : 0;
  return {
    general: Object.values(teamCounts).reduce((sum, count) => sum + count, 0) + updateUnread,
    repo: Object.values(projectCounts).reduce((sum, count) => sum + count, 0) + setupUnread
  };
}
function notificationEmpty(text) { return `<div class="notification-empty">${escape(text)}</div>`; }
function generalNotificationMarkup() {
  const items = [];
  if (state.updateInfo) items.push(`<a class="notification-item important" href="${escape(state.updateInfo.url)}" target="_blank" rel="noreferrer"><strong>TeamBrain güncellemesi hazır</strong><span>${escape(state.updateInfo.name || state.updateInfo.latest)} sürüm notlarını aç.</span><small>GENEL · SÜRÜM</small></a>`);
  const counts = notificationTracker.counts(teamNotificationScope());
  if (counts.team) items.push(`<button class="notification-item" type="button" data-notification-view="team"><strong>Ekip bilgileri güncellendi</strong><span>${counts.team} yeni ekip veya üye değişikliği var.</span><small>GENEL · EKİP</small></button>`);
  for (const message of state.teamChat.filter(item => item.event_type === 'chat.message').slice(-8).reverse()) {
    items.push(`<button class="notification-item" type="button" data-notification-view="chat" data-notification-chat-scope="team"><strong>${escape(message.actor_id || 'Ekip üyesi')}</strong><span>${escape(String(message.body || '').slice(0, 150))}</span><small>GENEL · EKİP SOHBETİ · ${date(message.created_at)}</small></button>`);
  }
  return items.join('') || notificationEmpty('Henüz genel bildirim yok.');
}
function repoNotificationMarkup() {
  const items = [], currentTeam = team(), repo = currentTeam?.github_repo;
  if (currentTeam) items.push(`<button class="notification-item important" type="button" data-notification-setup="${escape(currentTeam.id)}"><strong>TeamBrain kurulumunu tamamla</strong><span>${repo?.full ? `${escape(repo.full)} reposunu AI ajanı veya terminal sihirbazıyla bağla.` : 'Kurulum sihirbazını ve AI ajanı mesajını yeniden aç.'}</span><small>BU REPO · ÖNEMLİ</small></button>`);
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
  const counts = notificationSectionCounts(), total = counts.general + counts.repo;
  $('notifications-badge').hidden = total === 0;
  $('notifications-badge').textContent = total > 99 ? '99+' : String(total);
  $('general-notification-count').textContent = counts.general ? String(counts.general) : '';
  $('repo-notification-count').textContent = counts.repo ? String(counts.repo) : '';
  document.querySelectorAll('[data-notification-section]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.notificationSection === state.notificationSection)));
  $('notifications-list').innerHTML = state.notificationSection === 'general' ? generalNotificationMarkup() : repoNotificationMarkup();
}
function markNotificationSectionSeen(section) {
  if (section === 'general') {
    notificationTracker.markSeen(teamNotificationScope(), 'team');
    notificationTracker.markSeen(teamNotificationScope(), 'chat');
    if (state.updateInfo) localStorage.setItem('teambrain-notification-update-seen', state.updateInfo.latest);
  } else {
    for (const category of ['chat', 'activity', 'decisions', 'calendar', 'tasks']) notificationTracker.markSeen(projectNotificationScope(), category);
    if (state.team) localStorage.setItem(setupSeenKey(), 'true');
  }
  renderNotificationLights();
  renderNotificationCenter();
}
function observeNotifications(markCurrent = false) {
  const { teamItems, projectItems } = notificationItems();
  notificationTracker.observe(teamNotificationScope(), teamItems, ownActors());
  notificationTracker.observe(projectNotificationScope(), projectItems, ownActors());
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
    const agentPrompt = TeamBrainNotifications.buildAgentSetupPrompt(guide);
    localStorage.setItem(setupSeenKey(teamId), 'true');
    $('setup-content').innerHTML = `<p>Site ekip kaydını oluşturdu. Kod reposuna otomatik erişemediği için kurulumu aşağıdaki yöntemlerden biriyle tamamlayın.</p><section class="recommended-setup"><span class="badge">ÖNERİLEN</span><h3>AI ajanı kurulumu yapsın</h3><p>Bu mesajı Codex veya kullandığınız AI ajanına gönderin. Ajan doğru yerel repo yolunu doğrular, son seçimleri size gösterir ve TeamBrain kurulum sihirbazını çalıştırır.</p><label for="agent-setup-prompt">AI ajanına gönderilecek mesaj</label><textarea id="agent-setup-prompt" rows="7" readonly>${escape(agentPrompt)}</textarea><button class="primary" id="copy-agent-setup" type="button">AI mesajını kopyala</button></section><div class="setup-divider"><span>veya elle kur</span></div><ol>${guide.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol><label for="setup-command">CMD / PowerShell komutu</label><textarea id="setup-command" rows="4" readonly>${escape(guide.command)}</textarea><button class="secondary" id="copy-setup" type="button">Komutu kopyala</button><p class="detail-meta">Kod reposu yolundaki <code>C:\\path\\to\\code</code> bölümünü kendi klasörünüzle değiştirin.</p>`;
    $('setup-guide').showModal();
    $('copy-setup').onclick = async () => { await navigator.clipboard.writeText(guide.command); toast('Kurulum komutu panoya kopyalandı.'); };
    $('copy-agent-setup').onclick = async () => { await navigator.clipboard.writeText(agentPrompt); toast('AI ajanı kurulum mesajı panoya kopyalandı.'); };
    renderNotificationCenter();
  } catch (error) { toast(error.message); }
}
async function reloadTeams() {
  if (!state.actors.length) state.actors = (await api('/api/identity')).aliases || [];
  state.teams = await api('/api/teams');
  restoreSelection();
  choose();
  await loadTeamChat();
  await loadProject();
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
  $('breadcrumb').textContent = `${team()?.name || 'Çalışma alanı'}${data ? ' / ' + data.project.name : ''}`;
  $('heading').textContent = state.view === 'overview' ? data?.project.name || 'Ekibinin ortak hafızası.' : views[state.view];
  $('subtitle').textContent = state.view === 'chat' ? 'Projenin hafızasıyla konuş; her mesaj aynı zamanda kayıt olur.' : state.view === 'overview' ? 'Kararlar, çalışmalar ve onları birbirine bağlayan nedenler.' : 'Seçili projenin bilgisi. İhtiyacın olan bağlam, bir arada.';
  $('profile').textContent = (data?.actor || 'Y').slice(0, 1).toUpperCase();
  $('profile').title = data?.actor || 'Yerel kullanıcı';
  $('new-event').disabled = !data;
  $('upload-document').disabled = !data;
  $('hero').hidden = state.view !== 'overview';
  $('hero-action').textContent = !state.team ? 'İlk ekibini oluştur ↗' : !state.project ? 'İlk projeni oluştur ↗' : 'Bir karar kaydet ↗';
  $('metrics').hidden = !data || state.view === 'integrations' || state.view === 'chat';
  $('metrics').innerHTML = [[data?.total || 0, 'Toplam kayıt', 'Projenin kalıcı hafızası', '≋'], [decisions.length, 'Karar kaydı', 'Gerekçesiyle birlikte', '◇'], [events().filter(e => e.event_type === 'issue.detected').length, 'Sorun kaydı', 'Açık/kapalı takibi henüz yok', '◌'], [new Set(events().map(e => e.actor_id)).size, 'Katkı veren', 'Kayıtlardaki farklı kişiler', '↗']].map(([n, label, hint, icon]) => `<div class="metric"><div class="metric-top"><span>${label}</span><span>${icon}</span></div><strong>${n}</strong><small>${hint}</small></div>`).join('');
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === state.view); b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'); });
  renderNotificationLights();
  renderNotificationCenter();
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
function render() {
  const data = state.snapshot;
  const decisions = events().filter(e => e.event_type.startsWith('decision.'));
  renderShell(data, decisions);
  if (state.view === 'team') { renderTeam(); return; }
  if (state.view === 'chat' && !state.project) { renderChat(); return; }
  if (state.view === 'integrations') { renderConnections(); return; }
  if (!state.project) {
    const labels = {
      overview: ['Bu ekibin ilk projesini ekle.', 'Genel bakış, proje kayıtları oluşturulduğunda burada görünür.'],
      activity: ['Aktivite için bir proje gerekli.', 'Kayıtlar ve değişiklikler proje bazında tutulur.'],
      decisions: ['Karar defteri için bir proje gerekli.', 'Kararlar, ait oldukları projenin gerekçeleriyle birlikte saklanır.'],
      calendar: ['Takvim için bir proje gerekli.', 'Etkinlikler seçili projenin planına eklenir.'],
      tasks: ['Görevler için bir proje gerekli.', 'Görevler seçili projenin ekip üyelerine atanır.'],
      daily: ['Günün özeti için bir proje gerekli.', 'Günlük özet, seçili projenin bugünkü kayıtlarından oluşturulur.']
    };
    const [title, text] = state.team ? (labels[state.view] || labels.overview) : ['Ortak beyni bağla ve ekibini başlat.', 'Önce Bağlantılar bölümünü kontrol et, ardından ekip ve proje oluştur.'];
    $('content').innerHTML = `<section class="panel">${empty(title, text, { id: state.team ? 'project' : 'team', text: state.team ? '＋ Proje oluştur' : '＋ Ekip oluştur' })}</section>`;
    return;
  }
  if (!data) { $('content').innerHTML = '<div class="panel empty" role="status">Proje yükleniyor…</div>'; return; }
  if (state.view === 'team') renderTeam();
  else if (state.view === 'overview') renderOverview(decisions);
  else if (state.view === 'chat') renderChat();
  else if (['activity', 'decisions'].includes(state.view)) renderActivity();
  else if (state.view === 'calendar') renderCalendar();
  else if (state.view === 'tasks') renderTasks();
  else if (state.view === 'daily') renderDaily();
  else renderConnections();
}
function renderTeam() {
  const current = team() || {}, members = current.members || state.snapshot?.members || [], repo = current.github_repo;
  const status = current.members_state === 'synced' ? 'GitHub’dan güncel' : current.members_state === 'cached' ? 'Yerel önbellek' : 'Üye listesi bekleniyor';
  $('content').innerHTML = `<div class="connections"><section class="panel connection"><h3>GitHub ekibi</h3><span class="badge">${escape(status)}</span><p>${repo ? `Bağlı repo: <a href="${escape(repo.url)}" target="_blank" rel="noreferrer">${escape(repo.full)}</a>` : 'Bu ekip henüz bir GitHub memory reposuna bağlanmadı.'}</p><button class="secondary" data-action="refresh-members" ${repo ? '' : 'disabled'}>Üyeleri yenile</button></section><section class="panel connection"><h3>Ekip üyeleri</h3><span class="badge">${members.length} kişi</span><p>${members.length ? 'GitHub reposundaki erişimi olan kişiler aşağıda listelenir.' : 'Üyeler görünmüyorsa GitHub erişimini ve gh oturumunu kontrol edip yenile.'}</p></section></div><section class="panel member-list"><div class="panel-head"><h2>Üyeler</h2><span class="record-meta">Görev atamalarında kullanılabilir</span></div><div class="feed">${members.map(member => `<div class="record member-row"><span class="record-icon">●</span><span class="record-main"><span class="record-title">${escape(member.name || member.login)}</span><span class="record-meta">@${escape(member.login)}${member.permissions?.admin ? ' · yönetici' : ''}</span></span></div>`).join('') || empty('Henüz üye görünmüyor.', 'GitHub reposundaki üyeleri çekmek için Üyeleri yenile düğmesine bas.')}</div></section>`;
}
function renderOverview(decisions) {
  $('content').innerHTML = `<div class="content-grid"><section class="panel"><div class="panel-head"><h2>Son hareketler</h2><button class="text-button" data-action="activity">Tümünü gör ↗</button></div><div class="feed">${events().filter(e => !e.event_type.startsWith('chat.')).slice(0, 5).map(record).join('') || empty('İlk kaydınla hikâye başlasın.', 'Bir gelişme, fikir veya karar ekle.', { id: 'event', text: 'Yeni kayıt' })}</div></section><section class="panel"><div class="panel-head"><h2>Karar defteri</h2><span>◇</span></div>${decisions.slice(0, 3).map(e => `<button class="decision-card" data-event="${escape(e.event_id)}"><span class="badge">${escape(names[e.event_type] || 'Karar')}</span><h3>${escape(e.title)}</h3><span class="record-meta">${date(e.created_at)} · Gerekçeyi aç ↗</span></button>`).join('') || empty('Nedenini de hatırla.', 'Aldığınız kararları gerekçesiyle kaydedin.')}</section></div><div class="link-status">◉ &nbsp; Kayıtlar bu bilgisayarda saklanıyor. Sohbet dahil tüm proje hafızası yerel event olarak tutulur.</div>`;
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
function renderDaily() {
  const todays = events().filter(e => new Date(e.created_at).toDateString() === new Date().toDateString() && !e.event_type.startsWith('chat.'));
  $('content').innerHTML = `<section class="panel"><div class="panel-head"><h2>${today}</h2><span class="badge">KAYITLARDAN TÜRETİLDİ</span></div><div class="feed">${todays.map(record).join('') || empty('Bugün henüz kayıt yok.', 'Yeni kayıtlar günün özetinde otomatik görünür.')}</div></section><div class="link-status">Bu görünüm bir AI özeti değil; bugünkü kayıtların derlemesidir. Asıl kayıtları değiştirmez.</div>`;
}
function renderConnections() {
  $('content').innerHTML = `<div class="connections">${[['Git paylaşımı', 'Manuel CLI', 'Ekip paylaşımı için projeye özel bir memory deposu gerekir. Otomatik senkronizasyon ve arayüzden remote kurulumu henüz uygulanmadı.'], ['Chat sağlayıcıları', 'Yerel motor aktif', 'Codex, Claude veya Ollama adapterları aynı chat kontratına bağlanacak şekilde ayrıldı.'], ['Serena', 'Bağlı değil', 'Sembol ve kod etkisi analizleri için planlanan bağlantı. Mevcut adapter yalnızca verilen analiz verisini dönüştürür.'], ['Obsidian', 'Markdown uyumlu', 'Projenin memory klasöründeki kayıtlar okunabilir. Özel Obsidian eklentisi henüz bulunmuyor.']].map(([name, status, text]) => `<section class="panel connection"><h3>${name}</h3><span class="badge">${status}</span><p>${text}</p></section>`).join('')}</div><div class="link-status">Arama indeksini kayıtlardan yeniden kurabilirsin. <button class="secondary" data-action="reindex">İndeksi yenile</button></div>`;
}
function editor(mode) {
  if (mode === 'project' && !state.team) mode = 'team';
  state.mode = mode;
  $('form-error').textContent = '';
  $('editor-title').textContent = { team: 'Yeni bir ekip oluştur', project: 'Ekibine bir proje ekle', event: 'Birlikte hatırlanacak bir kayıt' }[mode];
  $('fields').innerHTML = mode === 'event' ? `<label for="event-type">Kayıt türü</label><select id="event-type" name="event_type">${Object.entries(names).filter(([v]) => !v.startsWith('chat.')).slice(0, 7).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><label for="event-title">Başlık</label><input id="event-title" name="title" maxlength="200" required placeholder="Örn. İletişim için CAN bus seçildi"><label for="event-body">Ne oldu, neden önemli?</label><textarea id="event-body" name="body" maxlength="50000" placeholder="Gerekçeyi ve değerlendirdiğiniz alternatifleri ekleyin."></textarea><label for="cause">Hangi kayda dayanıyor?</label><select id="cause" name="causation_id"><option value="">Bağımsız kayıt</option>${events().filter(e => !e.event_type.startsWith('chat.')).map(e => `<option value="${escape(e.event_id)}">${escape(e.title)}</option>`).join('')}</select>` : mode === 'team' ? `<label for="entity-name">Ekip adı</label><input id="entity-name" name="name" maxlength="100" placeholder="Örn. BIRDEV Studio"><label for="github-url">GitHub ekip reposu</label><input id="github-url" name="github_url" type="url" required placeholder="https://github.com/organizasyon/ekip-reposu"><p class="detail-meta">Repo linki doğrulanır ve ekip ile kalıcı olarak eşleştirilir. Ekip arkadaşları aynı repo üzerinden ortak hafızaya bağlanır.</p>` : `<label for="entity-name">Proje adı</label><input id="entity-name" name="name" maxlength="100" required placeholder="Örn. Robot kontrol sistemi"><p class="detail-meta">Bu proje seçili ekibe ait olacak ve ayrı bir kayıt geçmişi tutacak.</p>`;
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
$('team').addEventListener('change', async e => { state.team = e.target.value; state.project = team()?.projects[0]?.id || null; state.query = ''; rememberSelection(); choose(); await loadTeamChat(); await loadProject(); });
$('projects').addEventListener('click', async e => { const b = e.target.closest('[data-project]'); if (b) { state.project = b.dataset.project; state.query = ''; state.type = ''; rememberSelection(); choose(); await loadProject(); } });
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; state.query = ''; state.type = ''; markViewSeen(); render(); } });
$('content').addEventListener('click', async e => {  const calendarNav = e.target.closest('[data-calendar-nav]')?.dataset.calendarNav;
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
  if (['team', 'project', 'event'].includes(action)) editor(action);
  if (action === 'calendar' || action === 'task') plannerEditor(action);
  if (action === 'activity') { state.view = 'activity'; markViewSeen(); render(); }
  if (action === 'refresh') await loadProject();
  if (action === 'refresh-members') { const button = e.target.closest('[data-action]'); setButtonBusy(button, true, 'Yenileniyor'); try { const result = await api(`/api/teams/${state.team}/members`, {}, 'POST'); toast(`${result.members.length} GitHub üyesi güncellendi.`); await reloadTeams(); } catch (error) { toast(error.message); } finally { setButtonBusy(button, false); } }
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
    if (state.mode === 'team') { const result = await api('/api/teams', input); state.team = result.id; state.project = null; }
    else if (state.mode === 'project') { const result = await api(`/api/teams/${state.team}/projects`, input); state.project = result.id; }
    else if (state.mode === 'calendar') await api(base() + '/calendar', input);
    else if (state.mode === 'task') await api(base() + '/tasks', input);
    else await api(base() + '/events', input);
    $('editor').close();
    toast('Kaydedildi.');
    await reloadTeams();
    if (state.mode === 'team') await showSetupGuide(state.team);
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
    const requests = [api('/api/teams'), api(`/api/teams/${selectedTeam}/chat`)];
    if (selectedProject) requests.push(api(`/api/teams/${selectedTeam}/projects/${selectedProject}`));
    let [teams, teamChat, snapshot] = await Promise.all(requests);
    if (state.team !== selectedTeam || state.project !== selectedProject) return;
    const selected = teams.find(item => item.id === selectedTeam);
    if (selected?.github_repo && Date.now() - (state.memberRefresh[selectedTeam] || 0) > 5 * 60 * 1000) {
      state.memberRefresh[selectedTeam] = Date.now();
      try { await api(`/api/teams/${selectedTeam}/members`, {}, 'POST'); teams = await api('/api/teams'); } catch {}
    }
    state.teams = teams;
    state.teamChat = teamChat;
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
  const serena = c.serena?.configured ? 'Proje yapılandırması bulundu' : 'Yerel kod projesinde etkinleştirilmeli';
  const cards = [
    ['Git paylaşımı', github, c.github?.connected ? `Remote: ${escape(c.github.remote || '')}. Pull/push işlemleri açık ve bilinçlidir.` : 'Memory reposunu SETUP.md veya connect github komutuyla bağla.'],
    ['Chat sağlayıcıları', 'Yerel motor aktif', 'Sohbet yerel TeamBrain kayıtlarını arar; harici AI sağlayıcısı otomatik çağrılmaz.'],
    ['Serena', serena, 'Serena yalnızca kod sembolleri ve güvenli refactor içindir; ekip hafızasının sahibi değildir.'],
    ['AvenoxBeyin', 'Özel / manuel aktarım', 'Kişisel vault otomatik okunmaz. Yalnızca gizlilikten geçirilmiş özet aktarılır.'],
    ['Obsidian', 'Markdown uyumlu', 'Bu memory reposunu Obsidian ile açabilirsin; SQLite ve generated görünümler paylaşılmaz.']
  ];
  $('content').innerHTML = `<div class="connections">${cards.map(([name,status,text]) => `<section class="panel connection"><h3>${name}</h3><span class="badge">${status}</span><p>${text}</p></section>`).join('')}</div><div class="link-status">Bağlantı değiştiyse TeamBrain’i yeniden başlat. <button class="secondary" data-action="reindex">İndeksi yenile</button></div>`;
}
