/** @jsxImportSource @opentui/react */
// OpenTUI port of ../ui/FirstRunPicker.tsx.
//
// Key-handling notes: key.upArrow/downArrow -> e.name === 'up'/'down';
// key.ctrl && input==='c' -> e.ctrl && e.name === 'c'.
// Ink's useApp().exit() (unmount the whole Ink tree) has no direct OpenTUI
// analog at the component level — useRenderer().destroy() is the closest
// equivalent; the actual quit-on-cancel behavior may end up owned by
// cli/index.ts's mount/unmount wiring instead once this is wired in
// (Phase 5), same as it already partly is on the Ink side.

import { TextAttributes } from '@opentui/core';
import { useKeyboard, useRenderer } from '@opentui/react';
import { useState } from 'react';
import type { ToolingProfile } from '../config/config.js';
import { theme } from '../ui/theme.js';
import { MenuFrame, MenuRow } from './MenuFrame.js';

interface ProfileOption {
  value: ToolingProfile;
  label: string;
  description: string;
  helper: string;
}

const OPTIONS: ProfileOption[] = [
  {
    value: 'minimal',
    label: 'yalnızca curl + Unix araçları  (önerilen)',
    description: 'curl + jq, grep, awk, sed, head, sort, uniq',
    helper:
      "Ajan yalnızca yeniden üretilebilir tek satırlık komutlarda kalır. Her deneme doğrudan bir bug-bounty raporuna girer. Kendi başına ffuf / nuclei / sqlmap'e başvurmaz.",
  },
  {
    value: 'full',
    label: 'curl + Unix + özel tarayıcılar',
    description: 'ffuf, nuclei, sqlmap, gobuster, subfinder, httpx, wfuzz, masscan ekler',
    helper:
      'Ajan, iş yükünü değerlendirdiğinde (büyük fuzz, CVE şablon taraması) özel bir tarayıcı seçebilir. Her çalıştırmayı yine izin penceresinden onaylarsın — tarayıcılar yalnızca yerel olarak kuruluysa çağrılır.',
  },
];

export interface FirstRunPickerProps {
  onPick: (profile: ToolingProfile) => void;
  onCancel: () => void;
}

export function FirstRunPicker({ onPick, onCancel }: FirstRunPickerProps) {
  const [idx, setIdx] = useState(0);
  const renderer = useRenderer();

  useKeyboard((e) => {
    if (e.name === 'escape' || (e.ctrl && e.name === 'c')) {
      onCancel();
      renderer.destroy();
      return;
    }
    if (e.name === 'up') {
      setIdx((i) => (i - 1 + OPTIONS.length) % OPTIONS.length);
      return;
    }
    if (e.name === 'down') {
      setIdx((i) => (i + 1) % OPTIONS.length);
      return;
    }
    if (e.name === 'return') {
      const picked = OPTIONS[idx];
      if (picked) onPick(picked.value);
      return;
    }
  });

  const selected = OPTIONS[idx];

  return (
    <box style={{ flexDirection: 'column', paddingX: 1, paddingY: 1 }}>
      <box style={{ flexDirection: 'row', marginBottom: 1 }}>
        <text fg={theme.brand} attributes={TextAttributes.BOLD}>
          {theme.glyphs.brand}{' '}
        </text>
        <text fg={theme.brand} attributes={TextAttributes.BOLD}>
          Eschaton
        </text>
        <text fg={theme.muted}> · kurulum</text>
      </box>

      <MenuFrame
        header="Araç takımı"
        subtitle="Ajan hangi araçları kullanabilir?"
        footer="↑↓ gezin · Enter onayla · Esc çık"
        minWidth={56}
      >
        {OPTIONS.map((o, i) => {
          const isSelected = i === idx;
          return (
            <box
              key={o.value}
              style={{ flexDirection: 'column', marginBottom: i < OPTIONS.length - 1 ? 1 : 0 }}
            >
              <MenuRow selected={isSelected} primary={o.label} />
              <box style={{ flexDirection: 'row', paddingLeft: 4 }}>
                <text fg={theme.muted} attributes={TextAttributes.DIM}>
                  {o.description}
                </text>
              </box>
            </box>
          );
        })}
      </MenuFrame>

      {selected ? (
        <box style={{ flexDirection: 'row', marginTop: 1, paddingX: 1, width: 72 }}>
          <text fg={theme.muted} attributes={TextAttributes.DIM}>
            {selected.helper}
          </text>
        </box>
      ) : null}
    </box>
  );
}
