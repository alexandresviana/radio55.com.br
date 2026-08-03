export interface Radio {
  nome: string;
  pj: number;
  tipo: "comercial" | "comunitaria";
  /** Quando true, a emissora entra na fila de gravação (MP3, retenção ~24h). */
  gravar?: boolean;
  /**
   * Início da faixa de gravação (HH:MM, fuso America/Sao_Paulo).
   * Sem início/fim (ou iguais) = 24 horas.
   */
  gravarInicio?: string;
  /** Fim da faixa (HH:MM). Pode ser menor que o início (atravessa meia-noite). */
  gravarFim?: string;
  /** URL do stream ao vivo. Vazio = usa o mapeamento do radios.com.br. */
  streamUrl?: string;
}

export interface RadioStreamInfo {
  estado?: string;
  municipio: string;
  nome: string;
  radiosId: number;
  radiosUrl: string;
  title: string;
  streamUrl: string | null;
}

export interface MunicipioData {
  estado?: string;
  regiao: string;
  radios: Radio[];
}

export type EmissorasData = Record<string, MunicipioData>;

export interface GeoFeature {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    description: string;
  };
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

export interface GeoCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}
