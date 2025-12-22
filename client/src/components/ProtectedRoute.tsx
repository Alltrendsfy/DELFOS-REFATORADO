import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface UserPermissions {
  globalRole: string;
  isFranchisor: boolean;
  isFranchiseOwner: boolean;
  franchiseId: string | null;
  franchiseRole: string | null;
  permissions: {
    canViewAllFranchises: boolean;
    canManageFranchises: boolean;
    canViewFranchiseReports: boolean;
    canManageUsers: boolean;
    canCreateCampaigns: boolean;
    canViewCampaigns: boolean;
    canDeleteCampaigns: boolean;
    canViewRoyalties: boolean;
    canManageRoyalties: boolean;
    canRunAudit: boolean;
  };
}

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'franchisor' | 'franchisee' | 'admin';
  requiredPermission?: keyof UserPermissions['permissions'];
}

export function ProtectedRoute({ 
  children, 
  requiredRole,
  requiredPermission 
}: ProtectedRouteProps) {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();

  const { data: adminStatus } = useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/admin/status'],
  });

  const { data: permissions, isLoading } = useQuery<UserPermissions>({
    queryKey: ['/api/user/permissions'],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const isAdmin = adminStatus?.isAdmin ?? false;
  const isFranchisor = permissions?.isFranchisor ?? false;
  const hasFranchise = permissions?.franchiseId !== null && permissions?.franchiseId !== undefined;

  let hasAccess = true;

  if (requiredRole === 'franchisor') {
    hasAccess = isFranchisor || isAdmin;
  } else if (requiredRole === 'franchisee') {
    hasAccess = hasFranchise;
  } else if (requiredRole === 'admin') {
    hasAccess = isAdmin;
  }

  if (requiredPermission && permissions?.permissions) {
    hasAccess = hasAccess && permissions.permissions[requiredPermission];
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-destructive/10">
              <ShieldAlert className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle data-testid="text-access-denied-title">
              {t('accessDenied.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground" data-testid="text-access-denied-message">
              {t('accessDenied.message')}
            </p>
            <Button 
              onClick={() => setLocation('/')} 
              variant="outline"
              data-testid="button-go-home"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('accessDenied.goHome')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
