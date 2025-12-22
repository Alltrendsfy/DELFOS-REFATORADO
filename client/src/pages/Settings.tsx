import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { User, Globe, Moon, Sun, Info, Key, Eye, EyeOff } from 'lucide-react';

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();

  const [krakenCredentials, setKrakenCredentials] = useState({
    apiKey: '',
    apiSecret: '',
  });
  const [hasCredentials, setHasCredentials] = useState({
    hasApiKey: false,
    hasApiSecret: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch credential status on mount
  useEffect(() => {
    const fetchCredentialStatus = async () => {
      try {
        const response = await fetch('/api/user/kraken-credentials');
        if (response.ok) {
          const data = await response.json();
          setHasCredentials(data);
        }
      } catch (error) {
        console.error('Failed to fetch credential status:', error);
      }
    };
    fetchCredentialStatus();
  }, []);

  const handleSaveCredentials = async () => {
    console.log('[SETTINGS] Save credentials button clicked');
    
    if (!krakenCredentials.apiKey || !krakenCredentials.apiSecret) {
      console.log('[SETTINGS] Validation failed - missing credentials');
      toast({
        title: language === 'en' ? 'Validation Error' : language === 'es' ? 'Error de Validación' : 'Erro de Validação',
        description: language === 'en' ? 'Please enter both API Key and API Secret' : language === 'es' ? 'Por favor ingrese API Key y API Secret' : 'Por favor insira API Key e API Secret',
        variant: 'destructive',
      });
      return;
    }

    console.log('[SETTINGS] Validation passed - attempting to save credentials');
    console.log('[SETTINGS] API Key length:', krakenCredentials.apiKey.length);
    console.log('[SETTINGS] API Secret length:', krakenCredentials.apiSecret.length);

    setIsSaving(true);
    try {
      console.log('[SETTINGS] Sending POST request to /api/user/kraken-credentials');
      const response = await apiRequest('/api/user/kraken-credentials', 'POST', krakenCredentials);
      console.log('[SETTINGS] Save successful - response:', response);
      
      toast({
        title: language === 'en' ? 'Success' : language === 'es' ? 'Éxito' : 'Sucesso',
        description: language === 'en' ? 'Kraken credentials saved successfully' : language === 'es' ? 'Credenciales de Kraken guardadas exitosamente' : 'Credenciais da Kraken salvas com sucesso',
      });
      
      console.log('[SETTINGS] Updating state - hasCredentials to true');
      setHasCredentials({ hasApiKey: true, hasApiSecret: true });
      setKrakenCredentials({ apiKey: '', apiSecret: '' });
      console.log('[SETTINGS] State updated successfully');
    } catch (error) {
      console.error('[SETTINGS] Error saving credentials:', error);
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: language === 'en' ? 'Failed to save Kraken credentials' : language === 'es' ? 'Error al guardar credenciales de Kraken' : 'Falha ao salvar credenciais da Kraken',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      console.log('[SETTINGS] Save operation completed');
    }
  };

  const handleDeleteCredentials = async () => {
    setIsDeleting(true);
    try {
      await apiRequest('/api/user/kraken-credentials', 'DELETE', {});
      toast({
        title: language === 'en' ? 'Success' : language === 'es' ? 'Éxito' : 'Sucesso',
        description: language === 'en' ? 'Kraken credentials removed successfully' : language === 'es' ? 'Credenciales de Kraken eliminadas exitosamente' : 'Credenciais da Kraken removidas com sucesso',
      });
      setHasCredentials({ hasApiKey: false, hasApiSecret: false });
      setKrakenCredentials({ apiKey: '', apiSecret: '' });
    } catch (error) {
      toast({
        title: language === 'en' ? 'Error' : 'Error',
        description: language === 'en' ? 'Failed to remove Kraken credentials' : language === 'es' ? 'Error al eliminar credenciales de Kraken' : 'Falha ao remover credenciais da Kraken',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const languageOptions = [
    { value: 'en', label: 'English', nativeLabel: 'English' },
    { value: 'es', label: 'Spanish', nativeLabel: 'Español' },
    { value: 'pt-BR', label: 'Portuguese (Brazil)', nativeLabel: 'Português (BR)' },
  ];

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="page-settings">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
          {t('nav.settings')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {language === 'en' && 'Manage your account preferences and application settings'}
          {language === 'es' && 'Administre sus preferencias de cuenta y configuración de la aplicación'}
          {language === 'pt-BR' && 'Gerencie suas preferências de conta e configurações do aplicativo'}
        </p>
      </div>

      {/* Account Information */}
      <Card data-testid="card-account-info">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {language === 'en' && 'Account Information'}
            {language === 'es' && 'Información de la Cuenta'}
            {language === 'pt-BR' && 'Informações da Conta'}
          </CardTitle>
          <CardDescription>
            {language === 'en' && 'Your account details and profile information'}
            {language === 'es' && 'Detalles de su cuenta e información de perfil'}
            {language === 'pt-BR' && 'Detalhes da sua conta e informações de perfil'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                {language === 'en' && 'Name'}
                {language === 'es' && 'Nombre'}
                {language === 'pt-BR' && 'Nome'}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-user-name">
                {user?.firstName && user?.lastName 
                  ? `${user.firstName} ${user.lastName}` 
                  : user?.firstName || user?.email || 'Not available'}
              </p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                {language === 'en' && 'Email'}
                {language === 'es' && 'Correo electrónico'}
                {language === 'pt-BR' && 'E-mail'}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-user-email">
                {user?.email || 'Not available'}
              </p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                {language === 'en' && 'User ID'}
                {language === 'es' && 'ID de Usuario'}
                {language === 'pt-BR' && 'ID do Usuário'}
              </p>
              <p className="text-sm text-muted-foreground font-mono" data-testid="text-user-id">
                {user?.id || 'Not available'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language Settings */}
      <Card data-testid="card-language-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            {language === 'en' && 'Language'}
            {language === 'es' && 'Idioma'}
            {language === 'pt-BR' && 'Idioma'}
          </CardTitle>
          <CardDescription>
            {language === 'en' && 'Choose your preferred language for the application'}
            {language === 'es' && 'Elija su idioma preferido para la aplicación'}
            {language === 'pt-BR' && 'Escolha seu idioma preferido para o aplicativo'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={language}
            onValueChange={(value) => setLanguage(value as 'en' | 'es' | 'pt-BR')}
            className="space-y-3"
            data-testid="radiogroup-language"
          >
            {languageOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-3">
                <RadioGroupItem
                  value={option.value}
                  id={`language-${option.value}`}
                  data-testid={`radio-language-${option.value}`}
                />
                <Label
                  htmlFor={`language-${option.value}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{option.nativeLabel}</span>
                    <span className="text-sm text-muted-foreground">{option.label}</span>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Theme Settings */}
      <Card data-testid="card-theme-settings">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sun className="w-5 h-5" />
            {language === 'en' && 'Appearance'}
            {language === 'es' && 'Apariencia'}
            {language === 'pt-BR' && 'Aparência'}
          </CardTitle>
          <CardDescription>
            {language === 'en' && 'Choose between light and dark theme'}
            {language === 'es' && 'Elija entre tema claro y oscuro'}
            {language === 'pt-BR' && 'Escolha entre tema claro e escuro'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as 'light' | 'dark')}
            className="space-y-3"
            data-testid="radiogroup-theme"
          >
            {themeOptions.map((option) => (
              <div key={option.value} className="flex items-center space-x-3">
                <RadioGroupItem
                  value={option.value}
                  id={`theme-${option.value}`}
                  data-testid={`radio-theme-${option.value}`}
                />
                <Label
                  htmlFor={`theme-${option.value}`}
                  className="flex-1 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <option.icon className="w-4 h-4" />
                    <span className="font-medium">
                      {option.value === 'light' && (
                        <>
                          {language === 'en' && 'Light'}
                          {language === 'es' && 'Claro'}
                          {language === 'pt-BR' && 'Claro'}
                        </>
                      )}
                      {option.value === 'dark' && (
                        <>
                          {language === 'en' && 'Dark'}
                          {language === 'es' && 'Oscuro'}
                          {language === 'pt-BR' && 'Escuro'}
                        </>
                      )}
                    </span>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Kraken API Credentials */}
      <Card data-testid="card-kraken-credentials">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            {language === 'en' && 'Kraken API Credentials'}
            {language === 'es' && 'Credenciales API de Kraken'}
            {language === 'pt-BR' && 'Credenciais API da Kraken'}
          </CardTitle>
          <CardDescription>
            {language === 'en' && 'Connect your Kraken account for live trading'}
            {language === 'es' && 'Conecte su cuenta de Kraken para trading en vivo'}
            {language === 'pt-BR' && 'Conecte sua conta Kraken para trading ao vivo'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasCredentials.hasApiKey && hasCredentials.hasApiSecret ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Key className="w-4 h-4" />
                <span>
                  {language === 'en' && 'Credentials configured'}
                  {language === 'es' && 'Credenciales configuradas'}
                  {language === 'pt-BR' && 'Credenciais configuradas'}
                </span>
              </div>
              <Button
                variant="destructive"
                onClick={handleDeleteCredentials}
                disabled={isDeleting}
                data-testid="button-delete-kraken-credentials"
              >
                {isDeleting 
                  ? (language === 'en' ? 'Removing...' : language === 'es' ? 'Eliminando...' : 'Removendo...') 
                  : (language === 'en' ? 'Remove Credentials' : language === 'es' ? 'Eliminar Credenciales' : 'Remover Credenciais')
                }
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="kraken-api-key">
                  {language === 'en' && 'API Key'}
                  {language === 'es' && 'Clave API'}
                  {language === 'pt-BR' && 'Chave API'}
                </Label>
                <div className="relative">
                  <Input
                    id="kraken-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={krakenCredentials.apiKey}
                    onChange={(e) => setKrakenCredentials({ ...krakenCredentials, apiKey: e.target.value })}
                    placeholder={language === 'en' ? 'Enter your Kraken API Key' : language === 'es' ? 'Ingrese su Clave API de Kraken' : 'Insira sua Chave API da Kraken'}
                    data-testid="input-kraken-api-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiKey(!showApiKey)}
                    data-testid="button-toggle-api-key-visibility"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kraken-api-secret">
                  {language === 'en' && 'API Secret'}
                  {language === 'es' && 'Secreto API'}
                  {language === 'pt-BR' && 'Segredo API'}
                </Label>
                <div className="relative">
                  <Input
                    id="kraken-api-secret"
                    type={showApiSecret ? 'text' : 'password'}
                    value={krakenCredentials.apiSecret}
                    onChange={(e) => setKrakenCredentials({ ...krakenCredentials, apiSecret: e.target.value })}
                    placeholder={language === 'en' ? 'Enter your Kraken API Secret' : language === 'es' ? 'Ingrese su Secreto API de Kraken' : 'Insira seu Segredo API da Kraken'}
                    data-testid="input-kraken-api-secret"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowApiSecret(!showApiSecret)}
                    data-testid="button-toggle-api-secret-visibility"
                  >
                    {showApiSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleSaveCredentials}
                disabled={isSaving}
                data-testid="button-save-kraken-credentials"
              >
                {isSaving 
                  ? (language === 'en' ? 'Saving...' : language === 'es' ? 'Guardando...' : 'Salvando...') 
                  : (language === 'en' ? 'Save Credentials' : language === 'es' ? 'Guardar Credenciales' : 'Salvar Credenciais')
                }
              </Button>

              <p className="text-xs text-muted-foreground">
                {language === 'en' && 'Your credentials are encrypted and stored securely. They are required for live trading operations on Kraken.'}
                {language === 'es' && 'Sus credenciales se cifran y almacenan de forma segura. Son necesarias para operaciones de trading en vivo en Kraken.'}
                {language === 'pt-BR' && 'Suas credenciais são criptografadas e armazenadas com segurança. Elas são necessárias para operações de trading ao vivo na Kraken.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Information */}
      <Card data-testid="card-platform-info">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            {language === 'en' && 'Platform Information'}
            {language === 'es' && 'Información de la Plataforma'}
            {language === 'pt-BR' && 'Informações da Plataforma'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                {language === 'en' && 'Platform'}
                {language === 'es' && 'Plataforma'}
                {language === 'pt-BR' && 'Plataforma'}
              </p>
              <p className="text-sm text-muted-foreground">DELFOS Trading Platform</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                {language === 'en' && 'Version'}
                {language === 'es' && 'Versión'}
                {language === 'pt-BR' && 'Versão'}
              </p>
              <p className="text-sm text-muted-foreground">1.0.0</p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                {language === 'en' && 'Exchange'}
                {language === 'es' && 'Intercambio'}
                {language === 'pt-BR' && 'Corretora'}
              </p>
              <p className="text-sm text-muted-foreground">Kraken</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
