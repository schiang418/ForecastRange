import { File, Paths } from 'expo-file-system/next';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

function timestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function saveAnalysisAsMarkdown(
  title: string,
  content: string,
  filePrefix: string,
): Promise<void> {
  const ts = timestamp();
  const fileName = `${sanitize(filePrefix)}_${ts}.md`;

  const markdown = `# ${title}\n\n_Generated: ${new Date().toLocaleString()}_\n\n---\n\n${content}\n`;

  try {
    const file = new File(Paths.document, fileName);
    if (file.exists) {
      file.delete();
    }
    file.create();
    file.write(markdown);

    const sharingAvailable = await Sharing.isAvailableAsync();
    if (sharingAvailable) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'text/markdown',
        dialogTitle: `Save ${title}`,
        UTI: 'net.daringfireball.markdown',
      });
    } else {
      Alert.alert('Saved', `Analysis saved to:\n${fileName}`);
    }
  } catch (err: any) {
    Alert.alert('Save Error', err.message || 'Failed to save analysis');
  }
}
