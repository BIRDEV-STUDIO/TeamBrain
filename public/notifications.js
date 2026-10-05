'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeamBrainNotifications = api;
})(typeof globalThis === 'object' ? globalThis : this, function createModule() {
  const normalize = value => String(value || '').trim().toLocaleLowerCase('tr-TR');
  function buildAgentSetupPrompt(guide = {}) {
    const provided = String(guide.agent_prompt || '').trim();
    if (provided) return provided;
    const memoryRepository = String(guide.memory_repository || '').trim();
    const command = String(guide.command || '').trim();
    const team = String(guide.team?.name || guide.team?.id || 'Seçili ekip').trim();
    const project = String(guide.project?.name || guide.project?.id || 'Seçili proje').trim();
    const repositoryInstruction = memoryRepository
      ? `TeamBrain hafıza reposu olarak yalnızca şu kesin URL'yi kullan: ${memoryRepository}.`
      : 'Kuruluma başlamadan önce kullanıcıdan kesin özel TeamBrain hafıza repo URL’sini iste; URL’yi tahmin etme veya başka bir repo ile ikame etme.';
    return `Bu kod reposuna TeamBrain kur. Önce üzerinde çalıştığın kod reposunun tam yerel yolunu ve Git remote adresini doğrula. ${repositoryInstruction} Ekip: ${team}. Proje: ${project}. Kararlı TeamBrain actor kimliğini GitHub kullanıcı girişinden doğrula; kişiyi e-posta veya görünen addan tahmin etme. Otomatik senkron, başlangıç ayarı, ekip ve proje seçimlerini kullanıcıyla birlikte tamamla. Repo klonlamadan, hook kurmadan, AGENTS.md dosyasını değiştirmeden veya bağlantı dosyası yazmadan önce tüm son seçimleri kullanıcıya göster ve onaylat. Ardından TeamBrain kurulum sihirbazını çalıştır, kurulumu doğrula ve sonucu özetle.${command ? ` Kurulum komutu referansı: ${command}` : ''}`;
  }

  class NotificationTracker {
    constructor(storage, prefix = 'teambrain-unread-v1') {
      this.storage = storage;
      this.prefix = prefix;
    }
    key(scope) { return `${this.prefix}:${scope}`; }
    read(scope) {
      try {
        const value = JSON.parse(this.storage.getItem(this.key(scope)) || '{}');
        return value && typeof value === 'object' ? value : {};
      } catch { return {}; }
    }
    write(scope, value) {
      try { this.storage.setItem(this.key(scope), JSON.stringify(value)); } catch {}
    }
    observe(scope, items, ownActors = []) {
      if (!scope) return {};
      const state = this.read(scope);
      const self = new Set(ownActors.map(normalize).filter(Boolean));
      const grouped = items.reduce((result, item) => {
        if (!item?.category || !item?.id) return result;
        (result[item.category] ||= []).push({ id: String(item.id), actor: normalize(item.actor) });
        return result;
      }, {});
      for (const [category, current] of Object.entries(grouped)) {
        const previous = state[category];
        const ids = current.map(item => item.id);
        if (!previous) {
          state[category] = { known: ids.slice(-2000), unread: [] };
          continue;
        }
        const known = new Set(Array.isArray(previous.known) ? previous.known : []);
        const unread = new Set(Array.isArray(previous.unread) ? previous.unread : []);
        for (const item of current) {
          if (!known.has(item.id) && item.actor && !self.has(item.actor)) unread.add(item.id);
          known.add(item.id);
        }
        state[category] = { known: [...known].slice(-2000), unread: [...unread].slice(-2000) };
      }
      this.write(scope, state);
      return this.counts(scope);
    }
    markSeen(scope, category) {
      if (!scope || !category) return;
      const state = this.read(scope);
      if (state[category]) state[category].unread = [];
      this.write(scope, state);
    }
    counts(scope) {
      const state = this.read(scope);
      return Object.fromEntries(Object.entries(state).map(([category, value]) => [category, Array.isArray(value?.unread) ? value.unread.length : 0]));
    }
  }
  return { NotificationTracker, buildAgentSetupPrompt };
});
