import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Mail, 
  Key, 
  Shield, 
  ShieldCheck, 
  Trash2, 
  Plus,
  UserCheck,
  UserX,
  Ban,
  Github,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  BookOpen
} from 'lucide-react';
import AdminManual from '@/components/AdminManual';
import { format } from 'date-fns';

interface PlatformStats {
  users: { total: number; beta_approved: number; admins: number };
  betaCodes: { total: number; active: number; totalUses: number };
  authorizedEmails: { total: number; active: number };
}

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  is_beta_approved: boolean;
  is_admin: boolean;
  beta_code_used: string | null;
  createdAt: string;
}

interface BetaCode {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface AuthorizedEmail {
  id: string;
  email: string;
  added_by: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

interface BackupResult {
  success: boolean;
  filesUploaded: number;
  totalFiles: number;
  errors: string[];
  message: string;
}

interface ApiToken {
  id: string;
  name: string;
  user_id: string;
  permissions: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
}

export default function Admin() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState('');
  const [emailNotes, setEmailNotes] = useState('');
  const [newCode, setNewCode] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenUserId, setNewTokenUserId] = useState('');
  const [generatedToken, setGeneratedToken] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ['/api/admin/stats']
  });

  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users']
  });

  const { data: betaCodes, isLoading: codesLoading } = useQuery<BetaCode[]>({
    queryKey: ['/api/admin/beta-codes']
  });

  const { data: authorizedEmails, isLoading: emailsLoading } = useQuery<AuthorizedEmail[]>({
    queryKey: ['/api/admin/authorized-emails']
  });

  const { data: githubStatus } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/github/status']
  });

  const { data: githubRepos, isLoading: reposLoading } = useQuery<GitHubRepo[]>({
    queryKey: ['/api/github/repos'],
    enabled: githubStatus?.connected === true
  });

  const { data: apiTokens, isLoading: tokensLoading } = useQuery<ApiToken[]>({
    queryKey: ['/api/admin/api-tokens']
  });

  const createTokenMutation = useMutation({
    mutationFn: async (data: { user_id: string; name: string; permissions: string[] }) => {
      return apiRequest('/api/admin/api-tokens', 'POST', data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-tokens'] });
      setNewTokenName('');
      setNewTokenUserId('');
      setGeneratedToken(data.token);
      toast({ title: 'Token Created', description: 'Save the token - it cannot be retrieved later!' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const deactivateTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/api-tokens/${id}/deactivate`, 'PATCH');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-tokens'] });
      toast({ title: t('common.success'), description: 'Token deactivated' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/api-tokens/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/api-tokens'] });
      toast({ title: t('common.success'), description: 'Token deleted' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const addEmailMutation = useMutation({
    mutationFn: async (data: { email: string; notes: string | null }) => {
      return apiRequest('/api/admin/authorized-emails', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/authorized-emails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      setNewEmail('');
      setEmailNotes('');
      toast({ title: t('common.success'), description: 'Email added' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const removeEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/authorized-emails/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/authorized-emails'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: t('common.success'), description: 'Email removed' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const createCodeMutation = useMutation({
    mutationFn: async (data: { code: string; max_uses: number }) => {
      return apiRequest('/api/admin/beta-codes', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/beta-codes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      setNewCode('');
      setMaxUses('1');
      toast({ title: t('common.success'), description: 'Code created' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const deactivateCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      return apiRequest(`/api/admin/beta-codes/${code}/deactivate`, 'PATCH');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/beta-codes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: t('common.success'), description: 'Code deactivated' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/admin/users/${userId}/approve-beta`, 'PATCH');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: t('common.success'), description: 'User approved' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      return apiRequest(`/api/admin/users/${userId}/admin`, 'PATCH', { isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
      toast({ title: t('common.success'), description: 'Admin status updated' });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const backupMutation = useMutation({
    mutationFn: async (data: { owner: string; repo: string; message?: string }): Promise<BackupResult> => {
      return apiRequest('/api/github/backup', 'POST', data) as Promise<BackupResult>;
    },
    onSuccess: (result: BackupResult) => {
      queryClient.invalidateQueries({ queryKey: ['/api/github/repos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/github/status'] });
      if (result.success) {
        toast({ 
          title: t('common.success'), 
          description: result.message
        });
      } else {
        toast({ 
          title: 'Backup parcial',
          description: result.message,
          variant: 'default'
        });
      }
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    }
  });

  const handleBackup = () => {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split('/');
    backupMutation.mutate({ 
      owner, 
      repo, 
      message: backupMessage || undefined 
    });
  };

  const handleAddEmail = () => {
    if (!newEmail.trim()) return;
    addEmailMutation.mutate({ email: newEmail.trim(), notes: emailNotes.trim() || null });
  };

  const handleCreateCode = () => {
    if (!newCode.trim()) return;
    createCodeMutation.mutate({ code: newCode.trim(), max_uses: parseInt(maxUses) || 1 });
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-admin-title">
          {t('admin.title')}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card data-testid="card-stats-users">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('admin.users_title')}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-users-total">
                {stats?.users.total ?? 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats?.users.beta_approved ?? 0} {t('admin.users_beta')} | {stats?.users.admins ?? 0} {t('admin.users_admins')}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stats-codes">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('admin.beta_codes')}</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-codes-total">
                {stats?.betaCodes.total ?? 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats?.betaCodes.active ?? 0} {t('admin.codes_active')} | {stats?.betaCodes.totalUses ?? 0} {t('admin.codes_used')}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stats-emails">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('admin.emails_title')}</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-emails-total">
                {stats?.authorizedEmails.total ?? 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {stats?.authorizedEmails.active ?? 0} {t('admin.active')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="emails" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 max-w-3xl">
          <TabsTrigger value="emails" data-testid="tab-emails">
            <Mail className="h-4 w-4 mr-2" />
            {t('admin.emails_title')}
          </TabsTrigger>
          <TabsTrigger value="codes" data-testid="tab-codes">
            <Key className="h-4 w-4 mr-2" />
            {t('admin.codes_title')}
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-2" />
            {t('admin.users_title')}
          </TabsTrigger>
          <TabsTrigger value="tokens" data-testid="tab-tokens">
            <Shield className="h-4 w-4 mr-2" />
            API Tokens
          </TabsTrigger>
          <TabsTrigger value="backup" data-testid="tab-backup">
            <Github className="h-4 w-4 mr-2" />
            Backup
          </TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual">
            <BookOpen className="h-4 w-4 mr-2" />
            Manual
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emails" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.emails_title')}</CardTitle>
              <CardDescription>{t('admin.emails_description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder={t('admin.email_placeholder')}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="flex-1"
                  data-testid="input-new-email"
                />
                <Input
                  placeholder={t('admin.notes_placeholder')}
                  value={emailNotes}
                  onChange={(e) => setEmailNotes(e.target.value)}
                  className="flex-1"
                  data-testid="input-email-notes"
                />
                <Button 
                  onClick={handleAddEmail} 
                  disabled={addEmailMutation.isPending || !newEmail.trim()}
                  data-testid="button-add-email"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('admin.email_add')}
                </Button>
              </div>

              {emailsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : authorizedEmails && authorizedEmails.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>{t('admin.notes_placeholder')}</TableHead>
                      <TableHead>{t('admin.status')}</TableHead>
                      <TableHead>{t('admin.created_at')}</TableHead>
                      <TableHead>{t('admin.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authorizedEmails.map((email) => (
                      <TableRow key={email.id} data-testid={`row-email-${email.id}`}>
                        <TableCell className="font-medium">{email.email}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {email.notes || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={email.is_active ? 'default' : 'secondary'}>
                            {email.is_active ? t('admin.active') : t('admin.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(email.created_at), 'PP')}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEmailMutation.mutate(email.id)}
                            disabled={removeEmailMutation.isPending}
                            data-testid={`button-remove-email-${email.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t('admin.no_emails')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="codes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.codes_title')}</CardTitle>
              <CardDescription>{t('admin.codes_description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col md:flex-row gap-2">
                <Input
                  placeholder={t('admin.code_placeholder')}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  className="flex-1"
                  data-testid="input-new-code"
                />
                <Input
                  type="number"
                  placeholder={t('admin.max_uses')}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="w-24"
                  min="1"
                  data-testid="input-max-uses"
                />
                <Button 
                  onClick={handleCreateCode} 
                  disabled={createCodeMutation.isPending || !newCode.trim()}
                  data-testid="button-create-code"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('admin.code_add')}
                </Button>
              </div>

              {codesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : betaCodes && betaCodes.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>{t('admin.current_uses')}</TableHead>
                      <TableHead>{t('admin.expires')}</TableHead>
                      <TableHead>{t('admin.status')}</TableHead>
                      <TableHead>{t('admin.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {betaCodes.map((code) => (
                      <TableRow key={code.id} data-testid={`row-code-${code.id}`}>
                        <TableCell className="font-mono font-medium">{code.code}</TableCell>
                        <TableCell>
                          {code.current_uses} / {code.max_uses}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {code.expires_at 
                            ? format(new Date(code.expires_at), 'PP') 
                            : t('admin.never_expires')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={code.is_active ? 'default' : 'secondary'}>
                            {code.is_active ? t('admin.active') : t('admin.inactive')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {code.is_active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deactivateCodeMutation.mutate(code.code)}
                              disabled={deactivateCodeMutation.isPending}
                              data-testid={`button-deactivate-code-${code.id}`}
                            >
                              <Ban className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t('admin.no_codes')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('admin.users_title')}</CardTitle>
              <CardDescription>{t('admin.users_description')}</CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : users && users.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Beta</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>{t('admin.created_at')}</TableHead>
                        <TableHead>{t('admin.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.filter(u => !u.email?.includes('example.com') && !u.email?.includes('test.com') && !u.email?.includes('delfos.test')).map((user) => (
                        <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                          <TableCell className="font-medium">{user.email || '-'}</TableCell>
                          <TableCell>
                            {user.firstName} {user.lastName}
                          </TableCell>
                          <TableCell>
                            {user.is_beta_approved ? (
                              <Badge variant="default">
                                <UserCheck className="h-3 w-3 mr-1" />
                                {t('admin.active')}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <UserX className="h-3 w-3 mr-1" />
                                {t('admin.inactive')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {user.is_admin ? (
                              <Badge variant="default">
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Admin
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(user.createdAt), 'PP')}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {!user.is_beta_approved && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => approveUserMutation.mutate(user.id)}
                                  disabled={approveUserMutation.isPending}
                                  data-testid={`button-approve-${user.id}`}
                                >
                                  <UserCheck className="h-4 w-4 mr-1" />
                                  {t('admin.approve')}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleAdminMutation.mutate({ 
                                  userId: user.id, 
                                  isAdmin: !user.is_admin 
                                })}
                                disabled={toggleAdminMutation.isPending}
                                data-testid={`button-toggle-admin-${user.id}`}
                              >
                                {user.is_admin ? (
                                  <>
                                    <Shield className="h-4 w-4 mr-1" />
                                    {t('admin.remove_admin')}
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="h-4 w-4 mr-1" />
                                    {t('admin.make_admin')}
                                  </>
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t('admin.no_users')}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tokens" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                API Tokens
              </CardTitle>
              <CardDescription>
                Manage API tokens for external agents (like CRYPTOTRADER INSIDER)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedToken && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">Token Generated!</span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">Copy this token now - it cannot be retrieved later:</p>
                  <div className="flex gap-2">
                    <Input
                      value={generatedToken}
                      readOnly
                      className="font-mono text-xs"
                      data-testid="input-generated-token"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedToken);
                        toast({ title: 'Copied!', description: 'Token copied to clipboard' });
                      }}
                      data-testid="button-copy-token"
                    >
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setGeneratedToken('')}
                      data-testid="button-dismiss-token"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-col md:flex-row gap-2">
                <select
                  className="flex-1 h-10 px-3 border rounded-md bg-background"
                  value={newTokenUserId}
                  onChange={(e) => setNewTokenUserId(e.target.value)}
                  data-testid="select-token-user"
                >
                  <option value="">Select User...</option>
                  {users?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email || user.firstName || user.id}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Token name (e.g., CRYPTOTRADER INSIDER)"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  className="flex-1"
                  data-testid="input-token-name"
                />
                <Button
                  onClick={() => {
                    if (newTokenUserId && newTokenName.trim()) {
                      createTokenMutation.mutate({
                        user_id: newTokenUserId,
                        name: newTokenName.trim(),
                        permissions: ['read', 'trade']
                      });
                    }
                  }}
                  disabled={createTokenMutation.isPending || !newTokenUserId || !newTokenName.trim()}
                  data-testid="button-create-token"
                >
                  {createTokenMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Create Token
                </Button>
              </div>

              {tokensLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : apiTokens && apiTokens.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Last Used</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiTokens.map((token) => {
                        const tokenUser = users?.find(u => u.id === token.user_id);
                        return (
                          <TableRow key={token.id} data-testid={`row-token-${token.id}`}>
                            <TableCell className="font-medium">{token.name}</TableCell>
                            <TableCell>{tokenUser?.email || token.user_id}</TableCell>
                            <TableCell>
                              {token.is_active ? (
                                <Badge variant="default" className="bg-green-500">Active</Badge>
                              ) : (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {token.last_used_at ? format(new Date(token.last_used_at), 'MMM d, HH:mm') : 'Never'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(new Date(token.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {token.is_active && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => deactivateTokenMutation.mutate(token.id)}
                                    disabled={deactivateTokenMutation.isPending}
                                    data-testid={`button-deactivate-token-${token.id}`}
                                  >
                                    <Ban className="h-4 w-4 mr-1" />
                                    Deactivate
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteTokenMutation.mutate(token.id)}
                                  disabled={deleteTokenMutation.isPending}
                                  className="text-red-500 hover:text-red-700"
                                  data-testid={`button-delete-token-${token.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No API tokens created yet. Create one for external agents.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                GitHub Backup
              </CardTitle>
              <CardDescription>
                Backup do codigo DELFOS para o GitHub
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!githubStatus?.connected ? (
                <div 
                  data-testid="status-github-disconnected"
                  className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                >
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">GitHub nao conectado</p>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">Configure a integracao do GitHub no Replit para usar o backup.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Repositorio destino</label>
                      {reposLoading ? (
                        <Skeleton className="h-10 w-full" />
                      ) : (
                        <select
                          className="w-full h-10 px-3 border rounded-md bg-background"
                          value={selectedRepo}
                          onChange={(e) => setSelectedRepo(e.target.value)}
                          data-testid="select-repo"
                        >
                          <option value="">Selecione um repositorio...</option>
                          {githubRepos?.map((repo) => (
                            <option key={repo.id} value={repo.full_name}>
                              {repo.full_name} {repo.private ? '(privado)' : '(publico)'}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Mensagem do commit (opcional)</label>
                      <Input
                        placeholder="DELFOS Backup - descricao das alteracoes"
                        value={backupMessage}
                        onChange={(e) => setBackupMessage(e.target.value)}
                        data-testid="input-backup-message"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleBackup}
                    disabled={!selectedRepo || backupMutation.isPending}
                    className="w-full"
                    data-testid="button-backup"
                  >
                    {backupMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Fazendo backup...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Iniciar Backup para GitHub
                      </>
                    )}
                  </Button>

                  {backupMutation.isSuccess && backupMutation.data && (
                    <div 
                      data-testid="status-backup-result"
                      className={`flex items-start gap-3 p-4 rounded-lg border ${
                        backupMutation.data.success 
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                      }`}
                    >
                      {backupMutation.data.success ? (
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                      )}
                      <div>
                        <p className="font-medium" data-testid="text-backup-message">{backupMutation.data.message}</p>
                        <p className="text-sm text-muted-foreground" data-testid="text-backup-files">
                          {backupMutation.data.filesUploaded} de {backupMutation.data.totalFiles} arquivos enviados
                        </p>
                        {backupMutation.data.errors.length > 0 && (
                          <details className="mt-2">
                            <summary className="text-sm cursor-pointer text-destructive">
                              Ver erros ({backupMutation.data.errors.length})
                            </summary>
                            <ul className="mt-1 text-xs space-y-1">
                              {backupMutation.data.errors.map((err, i) => (
                                <li key={i} className="text-destructive">{err}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-sm text-muted-foreground space-y-1">
                    <p className="font-medium">Arquivos incluidos no backup:</p>
                    <ul className="list-disc list-inside text-xs space-y-0.5">
                      <li>client/src/**/*.ts, *.tsx, *.css</li>
                      <li>server/**/*.ts</li>
                      <li>shared/**/*.ts</li>
                      <li>package.json, tsconfig.json, vite.config.ts</li>
                      <li>tailwind.config.ts, drizzle.config.ts</li>
                      <li>replit.md, design_guidelines.md</li>
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <AdminManual />
        </TabsContent>
      </Tabs>
    </div>
  );
}
