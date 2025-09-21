import { useState } from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SearchProjects from '../components/search-projects';
import SwipeFull from '../components/swipe-full';

type ExploreMode = 'search' | 'swipe';

export default function index() {
  const [mode, setMode] = useState<ExploreMode>('swipe');

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Explore</Text>
        <View style={styles.toggleWrapper}>
          <TouchableOpacity
            accessibilityLabel="Switch to Search Mode"
            onPress={() => setMode('search')}
            style={[styles.toggleBtn, mode === 'search' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, mode === 'search' && styles.toggleTextActive]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityLabel="Switch to Swipe Mode"
            onPress={() => setMode('swipe')}
            style={[styles.toggleBtn, mode === 'swipe' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, mode === 'swipe' && styles.toggleTextActive]}>Swipe</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.content}>
        {mode === 'search' ? (
          <SearchProjects />
        ) : (
          <>
            <Text style={styles.swipeTagline}>Open to new ideas?</Text>
            <SwipeFull />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d0d0d' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
  toggleWrapper: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#2563eb',
    borderRadius: 999,
  },
  toggleText: { color: '#9ca3af', fontWeight: '600' },
  toggleTextActive: { color: 'white' },
  content: { flex: 1 },
  swipeTagline: {
    color: '#9CA3AF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: 10,
    fontSize: 16,
    fontStyle: 'normal',
  },
});