// @ts-check
// Lo usa .github/workflows/desktop.yml con una etiqueta flix-v*: cambia en dist/latest.yml la `url`/`path` del
// instalador (relativa a releases/latest/download/) por la del Release con etiqueta. electron-updater arma la
// dirección del .blockmap de la versión instalada cambiando la versión en esa url (flix-v0.31.0 → flix-v0.30.0):
// con la url fija de "latest" bajaría el .blockmap nuevo dos veces y la descarga por pedazos fallaría siempre.
//   node scripts/latest-yml.mjs dist/latest.yml https://github.com/<repo>/releases/download/flix-v0.30.0/flix-pc-setup.exe
import fs from 'node:fs'

const [file, url] = process.argv.slice(2)
if (!file || !url || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/flix-v\d+\.\d+\.\d+\/flix-pc-setup\.exe$/.test(url)) {
  console.error('Uso: node scripts/latest-yml.mjs <latest.yml> https://github.com/<repo>/releases/download/flix-vX.Y.Z/flix-pc-setup.exe')
  process.exit(1)
}
const re = /^(\s*(?:- )?(?:url|path)): flix-pc-setup\.exe\s*$/gm
const yml = fs.readFileSync(file, 'utf8')
if ((yml.match(re) || []).length < 2) {
  console.error(`${file} no tiene la url y el path esperados:\n${yml}`)
  process.exit(1)
}
fs.writeFileSync(file, yml.replace(re, (_, key) => `${key}: ${url}`))
console.log(fs.readFileSync(file, 'utf8'))
