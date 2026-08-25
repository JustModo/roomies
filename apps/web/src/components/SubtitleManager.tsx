import React, { useRef, useState } from 'react';
import { ChevronLeft, Upload, Trash2, FileText } from 'lucide-react';
import { Input } from './ui/Input';
import { IconButton } from './ui/IconButton';
import { Button } from './ui/Button';
import { fetchApi } from '../api/client';
import { MediaFile, Subtitle } from '@roomies/contracts';
import { displaySubtitleLabel } from './VideoPlayer/hooks/useSubtitles';

const SUBTITLE_ACCEPT = '.srt,.vtt,.ass,.ssa';

interface SubtitleManagerProps {
  mediaFile: MediaFile;
  onClose: () => void;
  onSubtitlesChange: (subtitles: Subtitle[]) => void;
}

export const SubtitleManager: React.FC<SubtitleManagerProps> = ({ mediaFile, onClose, onSubtitlesChange }) => {
  const [subtitles, setSubtitles] = useState<Subtitle[]>(mediaFile.subtitles);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedSubtitles = React.useMemo(() => {
    return [...subtitles].sort((a, b) => {
      const aExt = !!(a.language && (a.language.toLowerCase() === 'external' || a.language.toLowerCase().startsWith('external:')));
      const bExt = !!(b.language && (b.language.toLowerCase() === 'external' || b.language.toLowerCase().startsWith('external:')));
      if (aExt && !bExt) return -1;
      if (!aExt && bExt) return 1;
      const labelA = displaySubtitleLabel(a.language);
      const labelB = displaySubtitleLabel(b.language);
      return labelA.localeCompare(labelB);
    });
  }, [subtitles]);

  const updateSubtitles = (next: Subtitle[]) => {
    setSubtitles(next);
    onSubtitlesChange(next);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      if (language.trim()) formData.append('language', language.trim());
      formData.append('file', selectedFile);

      const created = (await fetchApi(`/library/media/${mediaFile.id}/subtitles`, {
        method: 'POST',
        body: formData,
      })) as Subtitle;

      updateSubtitles([...subtitles, created]);
      setSelectedFile(null);
      setLanguage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message || 'Failed to upload subtitle');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await fetchApi(`/library/subtitles/${id}`, { method: 'DELETE' });
      updateSubtitles(subtitles.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete subtitle');
    }
  };

  return (
    <div className="fixed inset-0 bg-void z-[60] flex flex-col">
      <div className="border-b border-ash flex items-center gap-3 p-4 sm:p-6">
        <IconButton icon={<ChevronLeft size={20} strokeWidth={1.5} />} onClick={onClose} />
        <div className="min-w-0">
          <h1 className="text-16 sm:text-20 font-medium uppercase tracking-[0.08em] text-paper">SUBTITLES</h1>
          <p className="text-12 text-fog truncate">{mediaFile.title}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-10 items-center">
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <h2 className="text-12 font-medium text-fog uppercase tracking-[0.08em]">Add Subtitle</h2>

          <input
            ref={fileInputRef}
            type="file"
            accept={SUBTITLE_ACCEPT}
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border border-dashed border-ash/40 hover:border-ash bg-ash/5 p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors duration-150"
          >
            {selectedFile ? (
              <>
                <FileText size={20} strokeWidth={1.5} className="text-paper" />
                <p className="text-13 text-paper truncate max-w-full">{selectedFile.name}</p>
              </>
            ) : (
              <>
                <Upload size={20} strokeWidth={1.5} className="text-fog" />
                <p className="text-13 text-fog">Click to choose a file</p>
              </>
            )}
            <p className="text-11 text-fog/60 uppercase tracking-wide">SRT · VTT · ASS · SSA</p>
          </div>

          <Input
            label="LANGUAGE (OPTIONAL)"
            placeholder="en, fr, ja..."
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />

          {error && <span className="text-13 text-red-400">{error}</span>}

          <Button onClick={handleUpload} disabled={!selectedFile || uploading} className="w-full">
            {uploading ? 'UPLOADING...' : 'UPLOAD'}
          </Button>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          <h2 className="text-12 font-medium text-fog uppercase tracking-[0.08em]">Tracks</h2>

          {subtitles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-fog text-14 border border-ash/20 border-dashed bg-ash/5 w-full">
              No subtitles yet
            </div>
          ) : (
            <div className="flex flex-col border border-ash/20 divide-y divide-ash/15 w-full">
              {sortedSubtitles.map((s) => {
                const isExternal = !!(s.language && (s.language.toLowerCase() === 'external' || s.language.toLowerCase().startsWith('external:')));
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 sm:p-4.5 hover:bg-ash/5 transition-all duration-200 group w-full">
                    <span className="text-14 text-paper/85">{displaySubtitleLabel(s.language)}</span>
                    {isExternal ? (
                      <IconButton
                        icon={<Trash2 size={16} strokeWidth={1.5} />}
                        onClick={() => handleDelete(s.id)}
                        className="opacity-0 group-hover:opacity-100 hover:!text-red-400"
                        title="Delete uploaded subtitle"
                      />
                    ) : (
                      <span className="text-11 text-fog/50 uppercase tracking-wider font-mono">Embedded</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
