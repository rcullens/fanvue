import { VideoPanel } from "@/components/VideoPanel";

export default function VideoPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Video</h1>
        <p className="page-sub">
          Lifelike video bots · free TTS + local ffmpeg preview ($0) · optional
          GPU CLI / Fanvue upload
        </p>
      </div>
      <VideoPanel />
    </div>
  );
}
