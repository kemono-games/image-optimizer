import { clean } from '@/lib/cache'

const [cmd, argv] = process.argv.slice(2)

if (cmd === 'clean') {
  clean()
}