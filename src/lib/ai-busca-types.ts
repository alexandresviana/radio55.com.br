export interface ConsultaInterpretada {
  fontes: ("radio" | "youtube")[];
  termos: string[];
  radio_nome: string | null;
  municipio: string | null;
  canal_youtube: string | null;
  data: string | null;
  hora_de: string | null;
  hora_ate: string | null;
  intencao: string;
}

export interface FonteCitada {
  ref: string;
  tipo: "radio" | "youtube";
  titulo: string;
  subtitulo: string;
  momento: string | null;
  texto: string;
  url: string;
}

export interface ResultadoBuscaIA {
  interpretacao: ConsultaInterpretada;
  resposta: string;
  fontes: FonteCitada[];
  aviso?: string;
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
  totalRadio: number;
  totalYoutube: number;
}
