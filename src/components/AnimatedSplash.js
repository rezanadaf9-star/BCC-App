import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, StatusBar, StyleSheet, View } from 'react-native';
import PoweredBy from './PoweredBy';
import { C, F } from '../theme';

const { width: W } = Dimensions.get('window');
const LOGO = 100;                                   // logo box: 100 x 100
const GAP = 14;
const TEXT_W = Math.min(W - LOGO - GAP - 36, 250);  // text column next to the logo
const ROW_W = LOGO + GAP + TEXT_W;
const SHIFT = ROW_W / 2 - LOGO / 2;                 // distance from screen-centre to the logo's final slot
const MIN_MS = 2600;                                // splash never shows longer than needed
const MAX_MS = 5000;                                // hard failsafe: leave the splash no matter what

/**
 * 1. logo pops in at the exact centre (100x100, transparent PNG, no crop, no rings)
 * 2. logo glides left; "Brilliant Coaching Centre" and "Estd. 2009 • Learn • Grow • Build"
 *    animate in on the same row, vertically centred with the logo
 * 3. fades out and the dashboard / login shows
 */
export default function AnimatedSplash({ ready, onDone }) {
  const pop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const t1 = useRef(new Animated.Value(0)).current;
  const t2 = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;

  // refs so timers never see stale props (this was the "loads forever" bug)
  const readyRef = useRef(ready);
  const doneRef = useRef(onDone);
  const minPassed = useRef(false);
  const finished = useRef(false);
  readyRef.current = ready;
  doneRef.current = onDone;

  const finish = (force) => {
    if (finished.current) return;
    if (!force && !(minPassed.current && readyRef.current)) return;
    finished.current = true;
    Animated.timing(out, { toValue: 0, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => doneRef.current && doneRef.current());
  };

  useEffect(() => {
    Animated.sequence([
      Animated.timing(pop, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      Animated.delay(250),
      Animated.parallel([
        Animated.timing(slide, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(250),
          Animated.timing(t1, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(t2, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]),
    ]).start();
    const a = setTimeout(() => { minPassed.current = true; finish(false); }, MIN_MS);
    const b = setTimeout(() => finish(true), MAX_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  useEffect(() => { finish(false); }, [ready]);

  const reveal = (v) => ({
    opacity: v,
    transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-22, 0] }) }],
  });

  return (
    <Animated.View style={[st.root, { opacity: out }]}>
      <StatusBar backgroundColor={C.splash} barStyle="dark-content" />
      <View style={st.center}>
        <View style={{ width: ROW_W, height: LOGO, flexDirection: 'row', alignItems: 'center' }}>
          <Animated.Image
            source={require('../../assets/shield.png')}
            resizeMode="contain"
            style={{
              width: LOGO, height: LOGO, opacity: pop,
              transform: [
                { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [SHIFT, 0] }) },
                { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            }}
          />
          <View style={{ width: TEXT_W, marginLeft: GAP, justifyContent: 'center' }}>
            <Animated.Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[st.name, reveal(t1)]}>
              Brilliant Coaching Centre
            </Animated.Text>
            <Animated.View style={[st.rule, { opacity: t2, transform: [{ scaleX: t2 }] }]} />
            <Animated.Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={[st.tag, reveal(t2)]}>
              Estd. 2009  •  Learn  •  Grow  •  Build
            </Animated.Text>
          </View>
        </View>
      </View>
      <PoweredBy style={st.footer} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: C.splash, zIndex: 1000, elevation: 50 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  name: { fontFamily: F.b, fontSize: 18, color: C.primary },
  rule: { height: 2, width: 34, backgroundColor: C.primary, borderRadius: 1, marginVertical: 5, alignSelf: 'flex-start' },
  tag: { fontFamily: F.m, fontSize: 11.5, color: C.primary },
});
