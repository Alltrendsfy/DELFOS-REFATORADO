import { useQuery } from "@tanstack/react-query";

// Apenas 3 personas: Franqueadora, Master, Franquia (que inclui trader)
export type UserPersona = 'franchisor' | 'master_franchise' | 'franchise';

interface PersonaData {
  persona: UserPersona;
  permissions: {
    globalRole: string;
    isFranchisor: boolean;
    isFranchiseOwner: boolean;
    isMasterFranchise: boolean;
    hasFranchise: boolean;
    franchiseId: string | null;
    franchiseRole: string | null;
    permissions: {
      view_reports: boolean;
      create_campaigns: boolean;
      manage_users: boolean;
      manage_finances: boolean;
    };
  };
}

export function usePersona() {
  const { data, isLoading, error } = useQuery<PersonaData>({
    queryKey: ['/api/user/persona'],
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Franquia é a persona padrão (inclui traders)
  // Não existe mais persona 'user' separada
  const persona = data?.persona ?? 'franchise';

  return {
    persona,
    permissions: data?.permissions ?? null,
    isLoading,
    error,
    isFranchisor: persona === 'franchisor',
    isMasterFranchise: persona === 'master_franchise',
    isFranchise: persona === 'franchise',
    // Método auxiliar para verificar se pode acessar configurações (apenas Franqueadora)
    canConfigurePlatform: persona === 'franchisor',
  };
}
