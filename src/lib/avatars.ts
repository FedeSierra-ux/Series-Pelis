// Avatares fijos de los perfiles (v0.24), como los personajes de Netflix o Prime: animales, personajes y
// criaturas en 3D de Fluent Emoji (Microsoft, licencia MIT). Viven en `public/avatars/<id>.webp` (160 px);
// el service worker los guarda la primera vez que se ven.

export type AvatarGroup = 'animales' | 'personajes' | 'criaturas'

export interface Avatar {
  id: string
  label: string
  group: AvatarGroup
}

export const AVATAR_GROUPS: { id: AvatarGroup; label: string }[] = [
  { id: 'animales', label: 'Animales' },
  { id: 'personajes', label: 'Personajes' },
  { id: 'criaturas', label: 'Criaturas' },
]

export const AVATARS: readonly Avatar[] = [
  { id: 'dog', label: 'Perro', group: 'animales' },
  { id: 'cat', label: 'Gato', group: 'animales' },
  { id: 'fox', label: 'Zorro', group: 'animales' },
  { id: 'lion', label: 'León', group: 'animales' },
  { id: 'tiger', label: 'Tigre', group: 'animales' },
  { id: 'bear', label: 'Oso', group: 'animales' },
  { id: 'panda', label: 'Panda', group: 'animales' },
  { id: 'koala', label: 'Koala', group: 'animales' },
  { id: 'monkey', label: 'Mono', group: 'animales' },
  { id: 'rabbit', label: 'Conejo', group: 'animales' },
  { id: 'hamster', label: 'Hámster', group: 'animales' },
  { id: 'mouse', label: 'Ratón', group: 'animales' },
  { id: 'frog', label: 'Rana', group: 'animales' },
  { id: 'pig', label: 'Chancho', group: 'animales' },
  { id: 'cow', label: 'Vaca', group: 'animales' },
  { id: 'wolf', label: 'Lobo', group: 'animales' },
  { id: 'owl', label: 'Búho', group: 'animales' },
  { id: 'penguin', label: 'Pingüino', group: 'animales' },
  { id: 'polar-bear', label: 'Oso polar', group: 'animales' },
  { id: 'raccoon', label: 'Mapache', group: 'animales' },
  { id: 'hedgehog', label: 'Erizo', group: 'animales' },
  { id: 'sloth', label: 'Perezoso', group: 'animales' },
  { id: 'otter', label: 'Nutria', group: 'animales' },
  { id: 'horse', label: 'Caballo', group: 'animales' },
  { id: 'zebra', label: 'Cebra', group: 'animales' },
  { id: 'giraffe', label: 'Jirafa', group: 'animales' },
  { id: 'elephant', label: 'Elefante', group: 'animales' },
  { id: 'llama', label: 'Llama', group: 'animales' },
  { id: 'parrot', label: 'Loro', group: 'animales' },
  { id: 'flamingo', label: 'Flamenco', group: 'animales' },
  { id: 'duck', label: 'Pato', group: 'animales' },
  { id: 'chick', label: 'Pollito', group: 'animales' },
  { id: 'turtle', label: 'Tortuga', group: 'animales' },
  { id: 'octopus', label: 'Pulpo', group: 'animales' },
  { id: 'dolphin', label: 'Delfín', group: 'animales' },
  { id: 'whale', label: 'Ballena', group: 'animales' },
  { id: 'shark', label: 'Tiburón', group: 'animales' },
  { id: 't-rex', label: 'T-rex', group: 'animales' },
  { id: 'sauropod', label: 'Dinosaurio', group: 'animales' },
  { id: 'ladybug', label: 'Vaquita de San Antonio', group: 'animales' },
  { id: 'butterfly', label: 'Mariposa', group: 'animales' },
  { id: 'bee', label: 'Abeja', group: 'animales' },
  { id: 'astronaut', label: 'Astronauta', group: 'personajes' },
  { id: 'ninja', label: 'Ninja', group: 'personajes' },
  { id: 'detective', label: 'Detective', group: 'personajes' },
  { id: 'mage', label: 'Mago', group: 'personajes' },
  { id: 'fairy', label: 'Hada', group: 'personajes' },
  { id: 'vampire', label: 'Vampiro', group: 'personajes' },
  { id: 'zombie', label: 'Zombi', group: 'personajes' },
  { id: 'genie', label: 'Genio', group: 'personajes' },
  { id: 'elf', label: 'Elfo', group: 'personajes' },
  { id: 'superhero', label: 'Superhéroe', group: 'personajes' },
  { id: 'supervillain', label: 'Villano', group: 'personajes' },
  { id: 'princess', label: 'Princesa', group: 'personajes' },
  { id: 'prince', label: 'Príncipe', group: 'personajes' },
  { id: 'santa', label: 'Papá Noel', group: 'personajes' },
  { id: 'pilot', label: 'Piloto', group: 'personajes' },
  { id: 'firefighter', label: 'Bombero', group: 'personajes' },
  { id: 'scientist', label: 'Científico', group: 'personajes' },
  { id: 'cook', label: 'Cocinero', group: 'personajes' },
  { id: 'singer', label: 'Cantante', group: 'personajes' },
  { id: 'technologist', label: 'Programador', group: 'personajes' },
  { id: 'cowboy', label: 'Vaquero', group: 'personajes' },
  { id: 'cool', label: 'Canchero', group: 'personajes' },
  { id: 'nerd', label: 'Nerd', group: 'personajes' },
  { id: 'disguised', label: 'Disfrazado', group: 'personajes' },
  { id: 'alien', label: 'Extraterrestre', group: 'criaturas' },
  { id: 'alien-monster', label: 'Marciano', group: 'criaturas' },
  { id: 'robot', label: 'Robot', group: 'criaturas' },
  { id: 'ghost', label: 'Fantasma', group: 'criaturas' },
  { id: 'dragon', label: 'Dragón', group: 'criaturas' },
  { id: 'unicorn', label: 'Unicornio', group: 'criaturas' },
  { id: 'ogre', label: 'Ogro', group: 'criaturas' },
  { id: 'goblin', label: 'Duende', group: 'criaturas' },
  { id: 'troll', label: 'Trol', group: 'criaturas' },
  { id: 'clown', label: 'Payaso', group: 'criaturas' },
  { id: 'pumpkin', label: 'Calabaza', group: 'criaturas' },
  { id: 'skull', label: 'Calavera', group: 'criaturas' },
  { id: 'snowman', label: 'Muñeco de nieve', group: 'criaturas' },
  { id: 'teddy', label: 'Osito', group: 'criaturas' },
]

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]))

export const isAvatarId = (v: unknown): v is string => typeof v === 'string' && BY_ID.has(v)
export const avatarById = (id: string | undefined) => (id ? BY_ID.get(id) : undefined)
export const avatarUrl = (id: string) => `/avatars/${id}.webp`

/** Uno al azar que no use otro perfil (para preelegir al crear uno nuevo). */
export function randomAvatar(taken: Iterable<string | undefined> = [], rand: () => number = Math.random): string {
  const used = new Set(taken)
  const free = AVATARS.filter((a) => !used.has(a.id))
  const pool = free.length > 0 ? free : AVATARS
  return pool[Math.floor(rand() * pool.length)].id
}
