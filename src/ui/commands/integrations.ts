// /snapshot, /burp, /report, /update — commands that talk to something
// outside the chat loop (disk snapshot, the Burp bridge, the findings
// report generator, the GitHub release updater).

import { runSelfUpdate } from '../../update/selfUpdate.js';
import type { SlashContext } from './context.js';

export function handleSnapshot(ctx: SlashContext): void {
  const { agent, dispatch } = ctx;
  void agent
    .saveContextSnapshot('elle /snapshot')
    .then((path) =>
      dispatch({
        type: 'append',
        entry: {
          kind: 'system',
          text: path
            ? `bağlam anlık görüntüsü kaydedildi: ${path}`
            : 'yapılandırılmış oturum deposu yok',
        },
      }),
    )
    .catch((err: unknown) =>
      dispatch({
        type: 'append',
        entry: { kind: 'error', text: `/snapshot: ${(err as Error).message}` },
      }),
    );
}

export function handleBurp(ctx: SlashContext): void {
  const { rest, dispatch, startBurpBridge } = ctx;
  if (!startBurpBridge) {
    dispatch({
      type: 'append',
      entry: { kind: 'error', text: '/burp bu çalışma ortamında kullanılamıyor.' },
    });
    return;
  }
  const portRaw = rest[0] ?? '';
  const port = portRaw ? Number.parseInt(portRaw, 10) : undefined;
  if (portRaw && (!Number.isFinite(port) || !port || port < 1 || port > 65535)) {
    dispatch({ type: 'append', entry: { kind: 'error', text: 'kullanım: /burp [port]' } });
    return;
  }
  void startBurpBridge(port)
    .then((result) =>
      dispatch({
        type: 'append',
        entry: {
          kind: 'system',
          text: result.alreadyRunning
            ? `Burp köprüsü zaten ${result.url} adresinde dinliyor\nBelirteç: ${result.token}`
            : `Burp köprüsü ${result.url} adresinde dinliyor\nBelirteç: ${result.token}`,
        },
      }),
    )
    .catch((err: unknown) =>
      dispatch({
        type: 'append',
        entry: { kind: 'error', text: `/burp: ${(err as Error).message}` },
      }),
    );
}

export function handleReport(ctx: SlashContext): void {
  const { rest, dispatch, generateFindingsReport } = ctx;
  if (!generateFindingsReport) {
    dispatch({
      type: 'append',
      entry: { kind: 'error', text: '/report bu çalışma ortamında kullanılamıyor.' },
    });
    return;
  }
  const fmtArg = (rest[0] ?? 'markdown').toLowerCase();
  if (fmtArg !== 'markdown' && fmtArg !== 'sarif') {
    dispatch({
      type: 'append',
      entry: { kind: 'error', text: 'kullanım: /report [markdown|sarif]' },
    });
    return;
  }
  void generateFindingsReport(fmtArg)
    .then((result) =>
      dispatch({
        type: 'append',
        entry: {
          kind: 'system',
          text:
            result.count === 0
              ? `Henüz kayıtlı bulgu yok — boş rapor ${result.path} konumuna yazıldı.`
              : `${result.count} bulgu ${result.path} konumuna aktarıldı`,
        },
      }),
    )
    .catch((err: unknown) =>
      dispatch({
        type: 'append',
        entry: { kind: 'error', text: `/report: ${(err as Error).message}` },
      }),
    );
}

export function handleUpdate(ctx: SlashContext): void {
  const { rest, dispatch } = ctx;
  const version = rest.join(' ').trim() || 'latest';
  dispatch({
    type: 'append',
    entry: { kind: 'system', text: `GitHub sürüm güncellemeleri denetleniyor (${version})…` },
  });
  void runSelfUpdate(version)
    .then((result) => {
      dispatch({
        type: 'append',
        entry: {
          kind: 'system',
          text:
            `güncelleme kuruldu (${result.version})` +
            `${result.installDir ? ` → ${result.installDir}` : ''}` +
            `${result.output ? `\n${result.output}` : ''}`,
        },
      });
    })
    .catch((err: unknown) => {
      dispatch({
        type: 'append',
        entry: { kind: 'error', text: `/update: ${(err as Error).message}` },
      });
    });
}

/** `/jobs` — list background shell jobs for the operator (not just the model). */
export function handleJobs(ctx: SlashContext): void {
  const text = ctx.listJobs?.() ?? 'arka plan işleri bu çalışma ortamında kullanılamıyor.';
  ctx.dispatch({ type: 'append', entry: { kind: 'system', text } });
}
