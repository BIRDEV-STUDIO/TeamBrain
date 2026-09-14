'use strict';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { teams: [], team: null, project: null, snapshot: null, view: 'overview', query: '', type: '', mode: null, version: 0 };
const names = { 'note.created': 'Not', 'issue.detected': 'Sorun', 'decision.proposed': 'Karar önerisi', 'decision.accepted': 'Kabul edilen karar', 'change.recorded': 'Değişiklik', 'impact.detected': 'Etki analizi', 'session.summary.imported': 'Oturum özeti' };
const views = { overview: 'Genel bakış', activity: 'Aktivite', decisions: 'Karar defteri', daily: 'Günün özeti', integrations: 'Bağlantılar' };
const date = value => new Date(value).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
const today = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
$('date').textContent = today.toLocaleUpperCase('tr-TR');
async function api(url, data) {
  const response = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'İşlem tamamlanamadı.');
  return result;
}
let toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 5500); }
function base() { return `/api/teams/${state.team}/projects/${state.project}`; }
function team() { return state.teams.find(t => t.id === state.team); }
function choose() {
  $('team').innerHTML = state.teams.length ? state.teams.map(t => `<option value="${escape(t.id)}">${escape(t.name)}</option>`).join('') : '<option>Henüz ekip yok</option>';
  if (state.team) $('team').value = state.team;
  $('projects').innerHTML = (team()?.projects || []).map(p => `<button data-project="${escape(p.id)}" class="${p.id === state.project ? 'active' : ''}"><span class="project-dot"></span>${escape(p.name)}</button>`).join('');
  $('add-project').disabled = !state.team;
}
async function reloadTeams() {
  state.teams = await api('/api/teams');
  if (!team()) state.team = state.teams[0]?.id || null;
  if (!team()?.projects.some(p => p.id === state.project)) state.project = team()?.projects[0]?.id || null;
  choose(); await loadProject();
}
async function loadProject() {
  const version = ++state.version;
  state.snapshot = null; render();
  if (!state.project) return;
  try {
    const result = await api(base());
    if (version !== state.version) return;
    state.snapshot = result;
    choose(); render();
  } catch (error) { if (version === state.version) toast(error.message); }
}
function empty(title, text, action) { return `<div class="empty"><span class="empty-symbol">✳</span><h3>${title}</h3><p>${text}</p>${action ? `<button class="secondary" data-action="${action.id}">${action.text}</button>` : ''}</div>`; }
function record(event) {
  const issue = event.event_type === 'issue.detected';
  return `<button class="record" data-event="${escape(event.event_id)}"><span class="record-icon ${issue ? 'issue' : ''}">${issue ? '!' : event.event_type.startsWith('decision.') ? '◇' : '≋'}</span><span class="record-main"><span class="record-title">${escape(event.title)}</span><span class="record-preview">${escape(event.body || 'Bağlamı görmek için kaydı aç.')}</span><span class="record-meta">${escape(event.actor_id)} · ${escape(names[event.event_type] || event.event_type)}</span></span><time class="record-time">${date(event.created_at)}</time></button>`;
}
function filtered() {
  return (state.snapshot?.events || []).filter(e => (!state.query || `${e.title} ${e.body}`.toLocaleLowerCase('tr-TR').includes(state.query.toLocaleLowerCase('tr-TR'))) && (!state.type || e.event_type === state.type) && (state.view !== 'decisions' || e.event_type.startsWith('decision.')));
}
function renderList() { const target = $('results'); if (target) target.innerHTML = filtered().map(record).join('') || empty('Burada henüz bir kayıt yok.', 'Aramanı değiştirebilir veya yeni bir kayıt ekleyebilirsin.'); }
function render() {
  const data = state.snapshot, events = data?.events || [], decisions = events.filter(e => e.event_type.startsWith('decision.'));
  $('breadcrumb').textContent = `${team()?.name || 'Çalışma alanı'}${data ? ' / ' + data.project.name : ''}`;
  $('heading').textContent = state.view === 'overview' ? data?.project.name || 'Ekibinin ortak hafızası.' : views[state.view];
  $('subtitle').textContent = state.view === 'overview' ? 'Kararlar, çalışmalar ve onları birbirine bağlayan nedenler.' : 'Seçili projenin bilgisi. İhtiyacın olan bağlam, bir arada.';
  $('profile').textContent = (data?.actor || 'Y').slice(0, 1).toUpperCase();
  $('profile').title = data?.actor || 'Yerel kullanıcı';
  $('new-event').disabled = !data;
  $('hero').hidden = state.view !== 'overview';
  $('hero-action').textContent = !state.team ? 'İlk ekibini oluştur ↗' : !state.project ? 'İlk projeni oluştur ↗' : 'Bir karar kaydet ↗';
  $('metrics').hidden = !data || state.view === 'integrations';
  $('metrics').innerHTML = [[data?.total || 0, 'Toplam kayıt', 'Projenin kalıcı hafızası', '≋'], [decisions.length, 'Karar kaydı', 'Gerekçesiyle birlikte', '◇'], [events.filter(e => e.event_type === 'issue.detected').length, 'Sorun kaydı', 'Açık/kapalı takibi henüz yok', '◌'], [new Set(events.map(e => e.actor_id)).size, 'Katkı veren', 'Kayıtlardaki farklı kişiler', '↗']].map(([n, label, hint, icon]) => `<div class="metric"><div class="metric-top"><span>${label}</span><span>${icon}</span></div><strong>${n}</strong><small>${hint}</small></div>`).join('');
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === state.view); b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'); });
  if (!state.project) {
    $('content').innerHTML = `<section class="panel">${empty(state.team ? 'Bu ekibin ilk projesini ekle.' : 'Birlikte çalıştığın ekiple başla.', 'Ekip ve projelerini buradan oluştur. Her projenin kayıtları ayrı tutulur.', { id: state.team ? 'project' : 'team', text: state.team ? '＋ Proje oluştur' : '＋ Ekip oluştur' })}</section>`;
    return;
  }
  if (!data) { $('content').innerHTML = '<div class="panel empty" role="status">Proje yükleniyor…</div>'; return; }
  if (state.view === 'overview') {
    $('content').innerHTML = `<div class="content-grid"><section class="panel"><div class="panel-head"><h2>Son hareketler</h2><button class="text-button" data-action="activity">Tümünü gör ↗</button></div><div class="feed">${events.slice(0, 5).map(record).join('') || empty('İlk kaydınla hikâye başlasın.', 'Bir gelişme, fikir veya karar ekle.', { id: 'event', text: 'Yeni kayıt' })}</div></section><section class="panel"><div class="panel-head"><h2>Karar defteri</h2><span>◇</span></div>${decisions.slice(0, 3).map(e => `<button class="decision-card" data-event="${escape(e.event_id)}"><span class="badge">${escape(names[e.event_type] || 'Karar')}</span><h3>${escape(e.title)}</h3><span class="record-meta">${date(e.created_at)} · Gerekçeyi aç ↗</span></button>`).join('') || empty('Nedenini de hatırla.', 'Aldığınız kararları gerekçesiyle kaydedin.')}</section></div><div class="link-status">◉ &nbsp; Kayıtlar bu bilgisayarda saklanıyor. Otomatik ekip senkronizasyonu henüz bağlı değil.</div>`;
  } else if (['activity', 'decisions'].includes(state.view)) {
    $('content').innerHTML = `<div class="toolbar"><label class="sr-only" for="search">Kayıtlarda ara</label><input id="search" type="search" value="${escape(state.query)}" placeholder="Başlık veya açıklamada ara…"><label class="sr-only" for="filter">Kayıt türü</label><select id="filter"><option value="">Tüm türler</option>${Object.entries(names).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><button class="secondary" data-action="refresh">Yenile</button></div><section class="panel"><div class="feed" id="results"></div></section><p class="detail-meta">En yeni ${events.length} / ${data.total} kayıt gösteriliyor.</p>`;
    $('filter').value = state.type; $('search').addEventListener('input', e => { state.query = e.target.value; renderList(); }); $('filter').addEventListener('change', e => { state.type = e.target.value; renderList(); }); renderList();
  } else if (state.view === 'daily') {
    const todays = events.filter(e => new Date(e.created_at).toDateString() === new Date().toDateString());
    $('content').innerHTML = `<section class="panel"><div class="panel-head"><h2>${today}</h2><span class="badge">KAYITLARDAN TÜRETİLDİ</span></div><div class="feed">${todays.map(record).join('') || empty('Bugün henüz kayıt yok.', 'Yeni kayıtlar günün özetinde otomatik görünür.')}</div></section><div class="link-status">Bu görünüm bir AI özeti değil; bugünkü kayıtların derlemesidir. Asıl kayıtları değiştirmez.</div>`;
  } else {
    $('content').innerHTML = `<div class="connections">${[['Git paylaşımı', 'Manuel CLI', 'Ekip paylaşımı için projeye özel bir memory deposu gerekir. Otomatik senkronizasyon ve arayüzden remote kurulumu henüz uygulanmadı.'], ['Serena', 'Bağlı değil', 'Sembol ve kod etkisi analizleri için planlanan bağlantı. Mevcut adapter yalnızca verilen analiz verisini dönüştürür.'], ['Oturum hafızası', 'Bağlı değil', 'Avenox yaklaşımından esinlenen yapılandırılmış özet dönüştürücüsü var. Canlı oturum yakalama henüz yok.'], ['Obsidian', 'Markdown uyumlu', 'Projenin memory klasöründeki kayıtlar okunabilir. Özel Obsidian eklentisi henüz bulunmuyor.']].map(([name, status, text]) => `<section class="panel connection"><h3>${name}</h3><span class="badge">${status}</span><p>${text}</p></section>`).join('')}</div><div class="link-status">Arama indeksini kayıtlardan yeniden kurabilirsin. <button class="secondary" data-action="reindex">İndeksi yenile</button></div>`;
  }
}
function editor(mode) {
  if (mode === 'project' && !state.team) mode = 'team';
  state.mode = mode; $('form-error').textContent = '';
  $('editor-title').textContent = { team: 'Yeni bir ekip oluştur', project: 'Ekibine bir proje ekle', event: 'Birlikte hatırlanacak bir kayıt' }[mode];
  $('fields').innerHTML = mode === 'event' ? `<label for="event-type">Kayıt türü</label><select id="event-type" name="event_type">${Object.entries(names).slice(0, 5).map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><label for="event-title">Başlık</label><input id="event-title" name="title" maxlength="200" required placeholder="Örn. İletişim için CAN bus seçildi"><label for="event-body">Ne oldu, neden önemli?</label><textarea id="event-body" name="body" maxlength="50000" placeholder="Gerekçeyi ve değerlendirdiğiniz alternatifleri ekleyin."></textarea><label for="cause">Hangi kayda dayanıyor?</label><select id="cause" name="causation_id"><option value="">Bağımsız kayıt</option>${(state.snapshot?.events || []).map(e => `<option value="${escape(e.event_id)}">${escape(e.title)}</option>`).join('')}</select>` : `<label for="entity-name">${mode === 'team' ? 'Ekip' : 'Proje'} adı</label><input id="entity-name" name="name" maxlength="100" required placeholder="${mode === 'team' ? 'Örn. BIRDEV Studio' : 'Örn. Robot kontrol sistemi'}"><p class="detail-meta">${mode === 'team' ? 'Sonraki adımda ekibine proje ekleyebilirsin.' : 'Bu proje seçili ekibe ait olacak ve ayrı bir kayıt geçmişi tutacak.'}</p>`;
  $('editor').showModal(); $('fields').querySelector('input')?.focus();
}
async function detail(eventId) {
  const event = state.snapshot?.events.find(e => e.event_id === eventId); if (!event) return;
  $('detail-content').innerHTML = `<span class="badge">${escape(names[event.event_type] || event.event_type)}</span><h2>${escape(event.title)}</h2><p class="detail-meta">${escape(event.actor_id)} · ${date(event.created_at)}</p><div class="detail-body">${escape(event.body || 'Açıklama eklenmemiş.')}</div><h3>Kararın izleri</h3><div id="chain">Yükleniyor…</div><p class="detail-meta">Kayıt kimliği: ${escape(event.event_id)}</p>`;
  $('detail').showModal();
  try { const chain = await api(base() + '/chain?event=' + encodeURIComponent(eventId)); $('chain').innerHTML = chain.map(e => `<div class="chain-item">${escape(e.title)}<small>${escape(names[e.event_type] || e.event_type)} · ${date(e.created_at)}</small></div>`).join(''); } catch (error) { $('chain').textContent = error.message; }
}
$('team').addEventListener('change', async e => { state.team = e.target.value; state.project = team()?.projects[0]?.id || null; state.query = ''; choose(); await loadProject(); });
$('projects').addEventListener('click', async e => { const b = e.target.closest('[data-project]'); if (b) { state.project = b.dataset.project; state.query = ''; state.type = ''; choose(); await loadProject(); } });
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; state.query = ''; state.type = ''; render(); } });
$('content').addEventListener('click', async e => {
  const event = e.target.closest('[data-event]'); if (event) { await detail(event.dataset.event); return; }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (['team', 'project', 'event'].includes(action)) editor(action);
  if (action === 'activity') { state.view = 'activity'; render(); }
  if (action === 'refresh') await loadProject();
  if (action === 'reindex') { try { const result = await api(base() + '/reindex', {}); toast(`${result.indexed} kayıt indekslendi.`); await loadProject(); } catch (error) { toast(error.message); } }
});
$('add-team').onclick = () => editor('team'); $('add-project').onclick = () => editor('project'); $('new-event').onclick = () => editor('event');
$('hero-action').onclick = () => editor(!state.team ? 'team' : !state.project ? 'project' : 'event');
$('close-editor').onclick = $('cancel').onclick = () => $('editor').close(); $('close-detail').onclick = () => $('detail').close();
$('editor-form').addEventListener('submit', async e => {
  e.preventDefault(); $('save').disabled = true; $('form-error').textContent = '';
  const input = Object.fromEntries(new FormData(e.target));
  try {
    if (state.mode === 'team') { const result = await api('/api/teams', input); state.team = result.id; state.project = null; }
    else if (state.mode === 'project') { const result = await api(`/api/teams/${state.team}/projects`, input); state.project = result.id; }
    else await api(base() + '/events', input);
    $('editor').close(); toast('Kaydedildi.'); await reloadTeams();
  } catch (error) { $('form-error').textContent = error.message; } finally { $('save').disabled = false; }
});
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); state.view = 'activity'; render(); $('search')?.focus(); } });
reloadTeams().catch(error => { $('content').textContent = 'Bağlantı kurulamadı: ' + error.message; toast(error.message); });
