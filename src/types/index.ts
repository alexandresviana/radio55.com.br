export interface Radio {
  nome: string;
  pj: number;
  tipo: "comercial" | "comunitaria";
  /** Quando true, a emissora é gravada continuamente em MP3 (retenção 24h). */
  gravar?: boolean;
  /** URL do stream ao vivo. Vazio = usa o mapeamento do radios.com.br. */
  streamUrl?: string;
}

export interface RadioStreamInfo {
  municipio: string;
  nome: string;
  radiosId: number;
  radiosUrl: string;
  title: string;
  streamUrl: string | null;
}

export interface MunicipioData {
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
