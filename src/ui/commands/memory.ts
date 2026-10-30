// /memory [add|list|forget|intel|provider|clear] and /user [add|clear] —
// read/mutate the agent's curated-memory, session-memory, intelligence, and
// user-profile stores.

import { type SlashContext, confirmDestructive } from './context.js';

export function handleMemory(ctx: SlashContext): void {
  const { agent, rest, dispatch } = ctx;
  const sub = (rest[0] ?? '').toLowerCase();
  if (sub === 'clear') {
    confirmDestructive(
      ctx,
      'Oturum belleği temizlensin mi?',
      'Bu, geçerli oturum kontrol noktasını kaldırır.',
      () =>
        void agent
          .clearMemory()
          .then(() =>
            dispatch({
              type: 'append',
              entry: { kind: 'system', text: 'oturum belleği temizlendi' },
            }),
          )
          .catch((err: unknown) =>
            dispatch({
              type: 'append',
              entry: { kind: 'error', text: `/memory clear: ${String(err)}` },
            }),
          ),
    );
    return;
  }
  if (sub === 'forget') {
    const query = rest.slice(1).join(' ').trim();
    if (!query) {
      dispatch({
        type: 'append',
        entry: { kind: 'error', text: 'kullanım: /memory forget <text>' },
      });
      return;
    }
    void agent
      .forgetMemory(query)
      .then((removed) =>
        dispatch({
          type: 'append',
          entry: {
            kind: 'system',
            text: removed.length
              ? `${removed.length} öğe unutuldu:\n${removed.map((r) => `- ${r}`).join('\n')}`
              : `"${query}" ile eşleşen bellek öğesi yok`,
          },
        }),
      )
      .catch((err: unknown) =>
        dispatch({
          type: 'append',
          entry: { kind: 'error', text: `/memory forget: ${String(err)}` },
        }),
      );
    return;
  }
  if (sub === 'add') {
    const text = rest.slice(1).join(' ').trim();
    if (!text) {
      dispatch({
        type: 'append',
        entry: { kind: 'error', text: 'kullanım: /memory add <text>  (veya #<text> kullanın)' },
      });
      return;
    }
    void agent
      .addMemory({ text })
      .then((fact) =>
        dispatch({
          type: 'append',
          entry: fact
            ? { kind: 'system', text: `hatırlandı (${fact.scope}/${fact.type}): ${fact.name}` }
            : { kind: 'error', text: 'bellek kaydedilmedi' },
        }),
      )
      .catch((err: unknown) =>
        dispatch({
          type: 'append',
          entry: { kind: 'error', text: `bellek kaydı başarısız: ${String(err)}` },
        }),
      );
    return;
  }
  if (sub === 'list') {
    const facts = agent.listCuratedMemory();
    dispatch({
      type: 'append',
      entry: {
        kind: 'system',
        text: facts.length
          ? `Kayıtlı bellek (${facts.length}):\n${facts.map((f) => `- [${f.type}] ${f.name} — ${f.description}`).join('\n')}`
          : 'henüz kayıtlı bellek yok — #<text> veya /memory add <text> ile ekleyin',
      },
    });
    return;
  }
  if (sub === 'intel') {
    const action = (rest[1] ?? 'stats').toLowerCase();
    if (action === 'clear') {
      const rawScope = (rest[2] ?? 'all').toLowerCase();
      // clearIntelligence falls through any unrecognized scope string to the
      // personal store (`t === 'project' ? projectPath : personalPath`) — a
      // typo like "personel" or "proj" used to silently wipe the personal
      // store instead of erroring. Validate against the exact allowed set.
      if (rawScope !== 'project' && rawScope !== 'personal' && rawScope !== 'all') {
        dispatch({
          type: 'append',
          entry: {
            kind: 'error',
            text: `bilinmeyen kapsam "${rawScope}" — /memory intel clear [project|personal|all] kullanın`,
          },
        });
        return;
      }
      const which = rawScope as 'project' | 'personal' | 'all';
      confirmDestructive(
        ctx,
        `İstihbarat temizlensin mi (${which})?`,
        'Öğrenilen bulgular kalıcı olarak kaldırılacak.',
        () =>
          void agent.clearIntelligence(which).then(() =>
            dispatch({
              type: 'append',
              entry: { kind: 'system', text: `istihbarat temizlendi (${which})` },
            }),
          ),
      );
      return;
    }
    if (action === 'stats' || action === 'list') {
      const s = agent.getIntelligenceStats();
      dispatch({
        type: 'append',
        entry: {
          kind: 'system',
          text: `İstihbarat (öğrenilen senaryolar) — project: ${s.project} · personal: ${s.personal}\n(otomatik sınırlandırılır + kapsam başına en yenilere budanır; silmek için /memory intel clear [project|personal|all] kullanın)`,
        },
      });
      return;
    }
    dispatch({
      type: 'append',
      entry: {
        kind: 'error',
        text: 'kullanım: /memory intel [stats|clear [project|personal|all]]',
      },
    });
    return;
  }
  if (sub === 'provider') {
    const providerName = agent.getMemoryProviderName();
    dispatch({
      type: 'append',
      entry: {
        kind: 'system',
        text: providerName
          ? `Harici bellek sağlayıcısı: ${providerName} (yerleşik bellekle birlikte etkin)`
          : 'Etkin harici bellek sağlayıcısı yok. ~/.eschaton/config.json içinde memory_provider ayarlayın (geçerli değerler: "sqlite" veya "off").',
      },
    });
    return;
  }
  // Default view: durable curated facts first, then the session checkpoint.
  const facts = agent.listCuratedMemory();
  const curated = facts.length
    ? `Kayıtlı bellek (${facts.length}):\n${facts.map((f) => `- [${f.type}] ${f.name} — ${f.description}`).join('\n')}`
    : 'Henüz kayıtlı bellek yok. #<text> veya /memory add <text> ile bir tane ekleyin.';
  dispatch({
    type: 'append',
    entry: { kind: 'system', text: `${curated}\n\n${agent.formatMemory()}` },
  });
}

export function handleUser(ctx: SlashContext): void {
  const { agent, rest, dispatch } = ctx;
  const sub = (rest[0] ?? '').toLowerCase();
  if (sub === 'clear') {
    confirmDestructive(
      ctx,
      'Kullanıcı profili temizlensin mi?',
      'Bu, kayıtlı tüm profil notlarını kaldırır.',
      () =>
        void agent
          .clearUserProfile()
          .then(() =>
            dispatch({
              type: 'append',
              entry: { kind: 'system', text: 'kullanıcı profili temizlendi' },
            }),
          )
          .catch((err: unknown) =>
            dispatch({
              type: 'append',
              entry: { kind: 'error', text: `/user clear: ${String(err)}` },
            }),
          ),
    );
    return;
  }
  if (sub === 'add') {
    const text = rest.slice(1).join(' ').trim();
    if (!text) {
      dispatch({ type: 'append', entry: { kind: 'error', text: 'kullanım: /user add <text>' } });
      return;
    }
    // addUserProfileNote() itself has no isRunning guard (the
    // update_user_profile tool calls it mid-turn by design), so the
    // user-typed path checks here instead of racing a concurrent
    // /compact or turn that could replace history right after this appends.
    if (agent.isRunning()) {
      dispatch({
        type: 'append',
        entry: {
          kind: 'error',
          text: '/user add: zaten çalışan bir tur var — sonra tekrar deneyin',
        },
      });
      return;
    }
    void agent
      .addUserProfileNote(text)
      .then(() =>
        dispatch({
          type: 'append',
          entry: { kind: 'system', text: `kullanıcı profiline kaydedildi: ${text}` },
        }),
      )
      .catch((err: unknown) =>
        dispatch({ type: 'append', entry: { kind: 'error', text: `/user add: ${String(err)}` } }),
      );
    return;
  }
  const profile = agent.getUserProfile();
  dispatch({
    type: 'append',
    entry: {
      kind: 'system',
      text: profile
        ? `Aracın senin hakkında öğrendikleri:\n${profile}`
        : 'Henüz bir şey kaydedilmedi — araç bunu zamanla öğrenir veya şimdi /user add <text> ile ekleyin.',
    },
  });
}
