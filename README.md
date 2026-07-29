# File Organizer

CLI-інструмент на Node.js для наведення ладу в директоріях (наприклад, у `Downloads`).
Дозволяє проаналізувати стан директорії, знайти дублікати за вмістом, відсортувати файли по
категоріях та видалити застарілі дані.

Застосунок побудований на **ES Modules**, використовує архітектуру на основі `EventEmitter`
(кожна команда — окремий клас із подіями прогресу), **streams** для ефективної роботи з
великими файлами та обробку помилок через `try...catch`.

## Вимоги

- Node.js версії **18** або новіше (використовується `fs.promises`, `stream/promises`).

## Встановлення

```bash
git clone https://github.com/sanyanut/file-organizer.git
cd file-organizer
npm install
```

## Структура проєкту

```
file-organizer/
├── package.json          # Конфігурація проєкту, "type": "module", npm scripts
├── .gitignore            # Виключення node_modules, логів тощо з Git
├── README.md             # Документація
├── file-organizer.js     # Точка входу: парсинг команд і підписка на події класів
└── lib/
    ├── scanner.js        # Клас Scanner    — команда scan
    ├── duplicates.js     # Клас DuplicateFinder — команда duplicates
    ├── organizer.js      # Клас Organizer  — команда organize
    └── cleanup.js        # Клас Cleanup    — команда cleanup
```

Кожен клас у `lib/` наслідується від `EventEmitter` і відповідає лише за бізнес-логіку —
він не знає, як виводити дані в консоль. Файл `file-organizer.js` підписується на події
(`file-found`, `file-processed`, `copy-progress`, `delete-progress` тощо) і відповідає за
відображення прогрес-бару та звітів.

## Використання

Команди можна викликати двома способами.

Напряму через Node.js:

```bash
node file-organizer.js <команда> <аргументи>
```

Або через npm scripts (подвійний дефіс `--` передає аргументи безпосередньо у скрипт):

```bash
npm run <команда> -- <аргументи>
```

---

### `scan` — аналіз директорії

Рекурсивно обходить директорію та збирає статистику: загальну кількість і розмір файлів,
розподіл за типами (розширеннями) і за віком, топ-3 найбільших файли та найстаріший файл.

```bash
node file-organizer.js scan /path/to/directory
# або
npm run scan -- /path/to/directory
```

**Аргументи**

| Аргумент      | Обовʼязковий | Опис                                    |
|---------------|:------------:|-----------------------------------------|
| `<directory>` |      так     | Шлях до директорії для сканування        |

**Приклад виводу**

```
📂 Scanning: /Users/student/Downloads
Processing... ████████████████████ 247/247 files

📊 Scan Results:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total files: 247
Total size: 1.2 GB

By File Type:
  .pdf    89 files   456 MB
  .zip    23 files   234 MB
  ...

File Age:
  Last 7 days:    45 files
  Last 30 days:   89 files
  Older than 90:  56 files

Largest files:
  1. video_lecture.mp4    450 MB
  2. archive_backup.zip   156 MB
  3. presentation.pptx     89 MB

Oldest file: old_report.pdf (modified 365 days ago)
```

---

### `duplicates` — пошук дублікатів

Знаходить файли з однаковим вмістом (навіть за різних назв) через обчислення хешу
**SHA-256**. Хеш рахується потоково через `fs.createReadStream()`, тому команда працює
навіть із великими файлами, які не поміщаються в оперативну памʼять. Файли з однаковим
хешем групуються, і для кожної групи показується обсяг «змарнованого» місця.

```bash
node file-organizer.js duplicates /path/to/directory
# або
npm run duplicates -- /path/to/directory
```

**Аргументи**

| Аргумент      | Обовʼязковий | Опис                                  |
|---------------|:------------:|---------------------------------------|
| `<directory>` |      так     | Шлях до директорії для перевірки       |

**Приклад виводу**

```
🔍 Searching for duplicates in: /Users/student/Downloads
Calculating hashes... ████████████████████ 247/247 files

Found 3 duplicate groups (8.7 MB wasted):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Group 1 (3 copies, 3.2 MB each):
  SHA-256: a3f2e1b8c4d5...

  📄 Downloads/lecture.pdf
  📄 Downloads/lecture(1).pdf
  📄 Downloads/backup/lecture_copy.pdf

  Wasted space: 6.4 MB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 Total wasted space: 8.7 MB
```

---

### `organize` — сортування по категоріях

Копіює файли з вихідної директорії у цільову, розкладаючи їх по категоріях залежно від
розширення. **Оригінали не видаляються.** Файли з невідомими розширеннями потрапляють у
`Other`. Малі файли (< 10 MB) копіюються через `fs.copyFile()`, великі (≥ 10 MB) — через
`pipeline()` зі streams. Якщо файл із такою назвою вже існує, додається суфікс:
`file.pdf` → `file(1).pdf` → `file(2).pdf`.

Категорії: `Documents`, `Images`, `Archives`, `Code`, `Videos`, `Other`.

```bash
node file-organizer.js organize /source/directory --output /target/directory
# або
npm run organize -- /source/directory --output /target/directory
```

**Аргументи та опції**

| Аргумент / опція        | Обовʼязковий | Опис                                        |
|-------------------------|:------------:|---------------------------------------------|
| `<directory>`           |      так     | Вихідна директорія (source)                  |
| `-o, --output <target>` |      так     | Цільова директорія, куди копіюються файли     |

**Приклад виводу**

```
📦 Organizing: /Users/student/Downloads
Target: /Users/student/Organized

Creating folders...
  ✓ Documents/
  ✓ Images/
  ...

Copying files... ████████████████████ 247/247

✅ Organization complete!

Summary:
  Documents: 134 files → Organized/Documents/
  Images:     67 files → Organized/Images/
  ...

Total copied: 247 files (1.2 GB)
```

---

### `cleanup` — видалення старих файлів

Знаходить файли, старіші за вказану кількість днів (за датою модифікації `mtime`).
За замовчуванням працює у **режимі попереднього перегляду (dry run)** — лише показує
список без видалення. Файли фактично видаляються тільки з прапорцем `--confirm`.

```bash
# Dry run — лише показати список (нічого не видаляється)
node file-organizer.js cleanup /path/to/directory --older-than 90

# Фактичне видалення
node file-organizer.js cleanup /path/to/directory --older-than 90 --confirm

# або через npm
npm run cleanup -- /path/to/directory --older-than 90 --confirm
```

**Аргументи та опції**

| Аргумент / опція       | Обовʼязковий | Опис                                                        |
|------------------------|:------------:|-------------------------------------------------------------|
| `<directory>`          |      так     | Директорія для очищення                                      |
| `--older-than <days>`  |      так     | Поріг віку у днях: видаляти файли, старіші за це значення     |
| `--confirm`            |       ні     | Виконати фактичне видалення. Без нього — лише dry run         |

**Приклад виводу (dry run)**

```
🧹 Cleanup: /Users/student/Downloads
Looking for files older than 90 days...

Found 45 files to delete:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
old_report.pdf
  Size: 2.3 MB
  Modified: 120 days ago
...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total: 45 files (156 MB)

⚠️  DRY RUN MODE: No files were deleted.
To actually delete these files, run with --confirm flag.
```

## Обробка помилок

Усі файлові операції обгорнуті в `try...catch`. Для типових кодів помилок виводяться
зрозумілі повідомлення, після чого процес завершується з кодом `1`:

- `ENOENT` — директорію не знайдено;
- `EACCES` — немає прав доступу;
- інші — виводиться `error.message`.

Файли, які не вдалося прочитати під час обробки окремих операцій, пропускаються без
переривання всієї команди.
