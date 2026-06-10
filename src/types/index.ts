export interface Radio {
  nome: string;
  pj: number;
  tipo: "comercial" | "comunitaria";
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
