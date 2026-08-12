import { useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../../store/useStore';
import { useAppTheme } from '../../hooks/useAppTheme';
import { Button, Dialog, EmptyState, Field } from '../../components/MD3';
import Ripple from '../../components/Ripple';
import { RADIUS } from '../../theme/theme';

export default function RepositoriesScreen() {
  const theme = useAppTheme();
  const { userRepositories, repoCatalog, addRepository, removeRepository, refreshRepositories } = useStore();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await addRepository(value);
      setOpen(false);
      setValue('');
    } catch (e) {
      Alert.alert('Could not add repository', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: 'row', gap: 10, padding: 16 }}>
        <Button label="Add repository" icon={<Ionicons name="add" size={17} color={theme.onPrimary} />} style={{ flex: 1 }} onPress={() => setOpen(true)} />
        <Button label="Refresh" variant="tonal" onPress={refreshRepositories} />
      </View>

      <FlatList
        data={userRepositories}
        keyExtractor={(url) => url}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
        renderItem={({ item }) => (
          <View
            style={{
              backgroundColor: theme.surface1,
              borderRadius: RADIUS.lg,
              padding: 14,
              marginBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{item}</Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 6 }}>
                {(repoCatalog[item]?.length ?? 0)} sources available
              </Text>
            </View>
            <Ripple
              borderless
              onPress={() =>
                Alert.alert('Remove repository', 'Installed extensions are kept.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => removeRepository(item) },
                ])
              }
            >
              <View style={{ padding: 8 }}>
                <Ionicons name="trash-outline" size={19} color={theme.error} />
              </View>
            </Ripple>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No repositories"
            subtitle="The app ships with zero sources. Add a plugin list URL to browse available extensions."
            action={<Button label="Add repository" onPress={() => setOpen(true)} />}
          />
        }
      />

      <Dialog visible={open} title="Add plugin repository" onDismiss={() => setOpen(false)}>
        <Field value={value} onChangeText={setValue} multiline autoFocus placeholder="https://…/plugins.min.json" />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button label="Cancel" variant="text" onPress={() => setOpen(false)} />
          <Button label="Add" loading={busy} onPress={add} />
        </View>
      </Dialog>
    </View>
  );
}
