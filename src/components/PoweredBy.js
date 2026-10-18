import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme';

/** "Powered By" (thin, 12px) / "Nadaf Creates" (16px bold), both navy, 25px bottom padding. Splash + login. */
export default function PoweredBy({ style }) {
  return (
    <View style={[st.wrap, style]} pointerEvents="none">
      <Text style={st.by}>Powered By</Text>
      <Text style={st.name}>Nadaf Creates</Text>
    </View>
  );
}
const st = StyleSheet.create({
  wrap: { alignItems: 'center', paddingBottom: 25, paddingTop: 10 },
  by: { fontFamily: F.t, fontSize: 12, color: C.primary, letterSpacing: 0.8 },
  name: { fontFamily: F.b, fontSize: 16, color: C.primary, marginTop: 1 },
});
