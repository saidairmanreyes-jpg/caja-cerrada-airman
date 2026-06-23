import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envFile = fs.readFileSync('.env', 'utf-8')
const supabaseUrl = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const supabaseKey = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data, error } = await supabase
    .from('inventory')
    .select('id, warehouse, location_id, package_id')
    .eq('warehouse', 'MATRIZ')
    .not('location_id', 'is', null)
    .is('package_id', null)

  if (error) {
    console.error('Error fetching:', error)
    return
  }

  console.log(`Found ${data.length} records to update.`)
  for (const item of data) {
    const pkgId = Math.floor(100000 + Math.random() * 900000).toString()
    await supabase.from('inventory').update({ package_id: pkgId }).eq('id', item.id)
    console.log(`Updated ${item.id} with package_id ${pkgId}`)
  }
}
run()
