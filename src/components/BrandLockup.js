import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { C, F } from '../theme';

/**
 * "BRILLIANT" is spread so its width exactly matches "COACHING CENTRE" underneath.
 * scale 1 = sidebar size. light = white/yellow text for navy backgrounds.
 */
export default function BrandLockup({ light = false, scale = 1, align = 'flex-start', estd = true }) {
  const [w, setW] = useState(0);
  const c1 = light ? C.white : C.primary;
  const c2 = light ? C.accent : C.primary;
  const big = 17 * scale;
  const small = 10.5 * scale;
  return (
    <View style={{ alignSelf: align }}>
      <View style={{ width: w || undefined, flexDirection: 'row', justifyContent: 'space-between' }}>
        {'BRILLIANT'.split('').map((ch, i) => (
          <Text key={i} style={{ fontFamily: F.b, fontSize: big, lineHeight: big * 1.25, color: c1 }}>{ch}</Text>
        ))}
      </View>
      <Text onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ fontFamily: F.s, fontSize: small, letterSpacing: 1 * scale, color: c2, alignSelf: 'flex-start' }}>
        COACHING CENTRE
      </Text>
      {estd && <Text style={{ fontFamily: F.m, fontSize: small * 0.9, color: c1, opacity: 0.8, marginTop: 1 }}>ESTD. 2009</Text>}
    </View>
  );
}
