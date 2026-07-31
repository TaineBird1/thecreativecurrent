import { useState, type ChangeEvent } from "react";
import { supabase } from "../../lib/supabaseClient";
import { STORAGE_BUCKET } from "../../lib/changeRequests";

type ScreenshotUploaderProps = {
  customerId: number;
  paths: string[];
  onChange: (paths: string[]) => void;
};

export function ScreenshotUploader({ customerId, paths, onChange }: ScreenshotUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    const newPaths: string[] = [];
    for (const file of Array.from(files)) {
      const path = `${customerId}/${crypto.randomUUID()}/${file.name}`;
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file);
      if (uploadError) {
        setError(uploadError.message);
        continue;
      }
      newPaths.push(path);
    }

    onChange([...paths, ...newPaths]);
    setUploading(false);
    e.target.value = "";
  }

  function removePath(path: string) {
    onChange(paths.filter((p) => p !== path));
  }

  return (
    <div className="grid gap-2">
      <label className="text-sm text-muted-foreground">Screenshots (optional)</label>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        onChange={handleFileChange}
        disabled={uploading}
        className="text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
      />
      {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
      {paths.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {paths.map((p) => (
            <li key={p} className="flex items-center justify-between gap-2">
              <span className="truncate">{p.split("/").pop()}</span>
              <button type="button" onClick={() => removePath(p)} className="text-red-500 hover:underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
