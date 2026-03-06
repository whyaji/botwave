import type { ExternalToast } from 'sonner';
import { toast } from 'sonner';

export function flare(
  message: string,
  data?: ExternalToast & {
    variant?: 'default' | 'success' | 'error' | 'info' | 'warning' | 'loading';
  }
) {
  switch (data?.variant) {
    case 'success':
      toast.success(message, {
        ...data,
        style: { ...data.style, backgroundColor: '#4caf50', color: '#fff' },
      });
      break;
    case 'error':
      toast.error(message, {
        ...data,
        style: { ...data.style, backgroundColor: '#f44336', color: '#fff' },
      });
      break;
    case 'info':
      toast.info(message, {
        ...data,
        style: { ...data.style, backgroundColor: '#2196f3', color: '#fff' },
      });
      break;
    case 'warning':
      toast.warning(message, {
        ...data,
        style: { ...data.style, backgroundColor: '#ff9800', color: '#fff' },
      });
      break;
    case 'loading':
      toast.loading(message, {
        ...data,
        style: { ...data.style, backgroundColor: '#9e9e9e', color: '#fff' },
      });
      break;
    case 'default':
    default:
      toast(message, data);
      break;
  }
}
