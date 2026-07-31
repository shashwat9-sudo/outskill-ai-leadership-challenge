import { Spinner } from '@/components/ui/primitives';

export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label="Loading the challenge" />
    </div>
  );
}
