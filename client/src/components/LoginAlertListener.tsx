import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { LogIn, Rocket, AlertTriangle } from 'lucide-react';

interface AdminAlert {
  id: string;
  alertType: 'user_login' | 'campaign_created' | 'circuit_breaker' | string;
  severity: 'info' | 'warning' | 'critical' | 'important' | string;
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  details?: Record<string, any>;
}

export function LoginAlertListener() {
  const { toast } = useToast();
  const { user } = useAuth();
  const seenAlertsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);

  const isAdmin = user?.is_admin === true;

  const { data: alerts } = useQuery<AdminAlert[]>({
    queryKey: ['/api/admin/monitor/alerts', { unreadOnly: 'false', limit: '20' }],
    enabled: isAdmin,
    refetchInterval: 5000,
    retry: false,
    staleTime: 3000,
  });

  useEffect(() => {
    if (!isAdmin || !alerts || alerts.length === 0) return;

    if (!hasInitializedRef.current) {
      alerts.forEach(alert => seenAlertsRef.current.add(alert.id));
      hasInitializedRef.current = true;
      return;
    }

    const newAlerts = alerts.filter(alert => !seenAlertsRef.current.has(alert.id));
    
    newAlerts.forEach(alert => {
      const getIcon = () => {
        switch (alert.alertType) {
          case 'user_login':
            return <LogIn className="h-4 w-4" />;
          case 'campaign_created':
            return <Rocket className="h-4 w-4" />;
          default:
            return <AlertTriangle className="h-4 w-4" />;
        }
      };

      const getVariant = (): 'default' | 'destructive' => {
        return ['critical', 'important'].includes(alert.severity) ? 'destructive' : 'default';
      };

      toast({
        title: alert.title,
        description: alert.message,
        variant: getVariant(),
        duration: 8000,
      });

      seenAlertsRef.current.add(alert.id);
    });
  }, [alerts, isAdmin, toast]);

  return null;
}
