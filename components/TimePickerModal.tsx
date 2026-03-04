import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { colors } from '@/styles/commonStyles';

interface TimePickerModalProps {
  visible: boolean;
  title: string;
  value: string;
  onConfirm: (time: string) => void;
  onCancel: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

export default function TimePickerModal({ visible, title, value, onConfirm, onCancel }: TimePickerModalProps) {
  const [selectedHour, setSelectedHour] = useState(value.split(':')[0]);
  const [selectedMinute, setSelectedMinute] = useState(value.split(':')[1]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={() => onConfirm(`${selectedHour}:${selectedMinute}`)}>
              <Text style={styles.confirmText}>Listo</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.preview}>
            <Text style={styles.previewText}>{selectedHour}:{selectedMinute}</Text>
          </View>

          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.columnLabel}>Hora</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
                {HOURS.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.option, selectedHour === h && styles.optionSelected]}
                    onPress={() => setSelectedHour(h)}
                  >
                    <Text style={[styles.optionText, selectedHour === h && styles.optionTextSelected]}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.column}>
              <Text style={styles.columnLabel}>Minutos</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
                {MINUTES.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.option, selectedMinute === m && styles.optionSelected]}
                    onPress={() => setSelectedMinute(m)}
                  >
                    <Text style={[styles.optionText, selectedMinute === m && styles.optionTextSelected]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  cancelText: { fontSize: 16, color: colors.textSecondary },
  confirmText: { fontSize: 16, color: colors.primary, fontWeight: '600' },
  preview: { alignItems: 'center', paddingVertical: 20 },
  previewText: { fontSize: 48, fontWeight: 'bold', color: colors.primary },
  columns: { flexDirection: 'row', paddingHorizontal: 20 },
  column: { flex: 1, alignItems: 'center' },
  columnLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 8, fontWeight: '600' },
  scroll: { maxHeight: 200, width: '100%' },
  option: { paddingVertical: 12, alignItems: 'center', borderRadius: 8, marginBottom: 4 },
  optionSelected: { backgroundColor: colors.primary },
  optionText: { fontSize: 18, color: colors.text },
  optionTextSelected: { color: '#fff', fontWeight: '600' },
});
