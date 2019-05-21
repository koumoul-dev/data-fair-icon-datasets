const config = require('config')
const fs = require('fs-extra')
const pump = require('util').promisify(require('pump'))
const { Writable } = require('stream')
const JSONStream = require('JSONStream')
const FormData = require('form-data')
const axios = require('axios').create({
  baseURL: config.dataFair.url + '/api/v1/',
  headers: { 'x-apiKey': config.dataFair.apiKey }
})

function descriptionMdi (version) {
  return `
Icon set from the [Material Design Icons](https://materialdesignicons.com/) project version ${version}.

Contains icons from the standard pack from Google and contributions by the community.
`
}

const schema = [
  { key: 'path', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' },
  { key: 'name', type: 'string', 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' },
  { key: 'aliases', type: 'string' },
  { key: 'tags', type: 'string' },
  { key: 'author', type: 'string' },
  { key: 'version', type: 'string' },
  { key: 'pack', type: 'string' },
  { key: 'packVersion', type: 'string' },
  { key: 'svg', type: 'string' }
]

async function main () {
  console.log('Starting...')

  const mdiPJson = await fs.readJson('./node_modules/@mdi/svg/package.json')

  console.log('Create/recreate a dataset for current version')
  try {
    await axios.delete(`datasets/icons-mdi-${mdiPJson.version}`)
  } catch (err) {
    console.log('err', err)
    // nothing
  }

  const mdiDataset = (await axios.put(`datasets/icons-mdi-${mdiPJson.version}`, {
    title: `Icons - MDI - ${mdiPJson.version}`,
    description: descriptionMdi(mdiPJson.version),
    attachmentsAsImage: true,
    isRest: true,
    schema
  })).data
  console.log('MDI dataset created/updated', mdiDataset)

  await pump(
    fs.createReadStream('./node_modules/@mdi/svg/meta.json'),
    JSONStream.parse('*'),
    new Writable({
      objectMode: true,
      async write (chunk, encoding, callback) {
        try {
          const svgPath = `./node_modules/@mdi/svg/svg/${chunk.name}.svg`

          const form = new FormData()
          form.append('name', chunk.name)
          if (chunk.aliases.length) form.append('aliases', chunk.aliases.join(', '))
          if (chunk.tags.length) form.append('tags', chunk.tags.join(', '))
          form.append('author', chunk.author)
          form.append('version', chunk.version)
          form.append('pack', 'mdi')
          form.append('packVersion', mdiPJson.version)
          form.append('svg', await fs.readFile(svgPath, 'utf8'))
          form.append('attachment', fs.createReadStream(svgPath))
          process.stdout.write('.')
          await axios({
            method: 'put',
            url: `datasets/icons-mdi-${mdiPJson.version}/lines/${chunk.name}`,
            data: form,
            headers: form.getHeaders()
          })
          callback()
        } catch (err) {
          callback(err)
        }
      }
    })
  )

  console.log('Create/update a virtual dataset serving as alias to latest version')
  const mdiLatestDataset = (await axios.put(`datasets/icons-mdi-latest`, {
    title: 'Icons - MDI - latest',
    description: descriptionMdi('latest'),
    attachmentsAsImage: true,
    isVirtual: true,
    virtual: {
      children: [`icons-mdi-${mdiPJson.version}`]
    },
    schema
  })).data

  console.log('MDI latest virtual dataset created/updated', mdiLatestDataset)

  console.log('...done')
}

main().then(() => process.exit(), err => { console.error('Failure', (err.response && err.response.data) || err); process.exit(1) })
