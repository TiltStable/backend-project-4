# Загрузчик страниц (JS)

[![hexlet-check](https://github.com/TiltStable/backend-project-4/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/TiltStable/backend-project-4/actions)

Утилита командной строки `page-loader`: скачивает страницу из сети и сохраняет
её в указанную директорию (по умолчанию — текущая). В stdout печатается полный
путь к загруженному файлу.

На базовом уровне научитесь работать с асинхронным кодом в JavaScript, писать тесты на Mock / Stub, работать с ошибками и исключениями, DOM, promises, async / await, работать с HTTP.

Учебный проект Хекслета: https://ru.hexlet.io/programs/backend
Как это должно работать: https://asciinema.org/a/dVKok25V5xW2SkjMF4LE8fZOw

## Стек

- JavaScript (ESM), Node.js >= 22
- axios — HTTP-запросы (зафиксирована версия 1.1.3, см. подсказки задания)
- commander — разбор аргументов командной строки
- cheerio — работа с DOM страницы при локализации ресурсов
- Vitest + nock — тесты с моками HTTP-запросов
- oxlint + oxfmt — линтер и форматтер, Makefile для типовых команд

## Установка

Требуется Node.js >= 22.

```bash
git clone https://github.com/TiltStable/backend-project-4.git
cd backend-project-4
make install # или npm ci
npm link # делает команду page-loader глобально доступной
```

## Использование

```bash
# по умолчанию output это process.cwd()
page-loader --output /var/tmp https://ru.hexlet.io/courses
/var/tmp/ru-hexlet-io-courses.html # путь к загруженному файлу

open /var/tmp/ru-hexlet-io-courses.html
```

Имя файла формируется из адреса страницы:

- берётся адрес без протокола;
- все символы, кроме букв и цифр, заменяются на дефис `-`;
- в конце ставится `.html`.

Например:

```bash
page-loader https://ru.hexlet.io/courses
ru-hexlet-io-courses.html
```

Вместе со страницей скачиваются её локальные ресурсы: изображения (`<img
src>`), стили и другие файлы из `<link href>`, скрипты из `<script src>`.
Они кладутся в директорию `ru-hexlet-io-courses_files` (имя основного файла
без `.html` + `_files`), каждый ресурс получает имя из своего URL по тому
же правилу (с сохранением расширения; безрасширительные пути сохраняются
как `.html`), а все ссылки в HTML переписываются на локальные файлы —
страница открывается со своей машины без доступа к сети.

Локальным считается ресурс на том же хосте, что и страница (например,
для `https://ru.hexlet.io/courses` это `ru.hexlet.io`, но не
`cdn2.hexlet.io` и не `js.stripe.com`) — ссылки на чужие хосты остаются
нетронутыми. Ресурсы без расширения в пути сохраняются с расширением
`.html`.

Ресурсы загружаются параллельно — не более 5 одновременных запросов
(библиотека [listr](https://github.com/SamVerschueren/listr)), в
терминале виден прогресс по каждому ресурсу. В неинтерактивных
окружениях (CI, пайпы) вывод прогресса отключается. Если какой-то
ресурс не скачался, утилита завершается с ошибкой: модифицированная
страница при этом не сохраняется, а уже скачанные файлы остаются в
`_files` (повторный запуск переиспользует директорию — имена файлов
детерминированы).

## Ошибки

Сообщения об ошибках выводятся в stderr, код возврата — `1` (успех — `0`),
что позволяет использовать утилиту в скриптах и CI. Сообщение называет
операцию и проблемный объект:

```bash
page-loader --output /var/tmp https://ru.hexlet.io/missing-page
# Failed to download page "https://ru.hexlet.io/missing-page": Request failed with status code 404

page-loader --output /root/forbidden https://ru.hexlet.io/courses
# Failed to create output directory "/root/forbidden": EACCES: permission denied, mkdir '/root/forbidden'
```

Аналогично оформлены ошибки скачивания и сохранения ресурсов
(`Failed to download resource "<url>": …`, `Failed to save resource "<name>": …`)
и записи страницы (`Failed to save page "<path>": …`).

## Отладка

Утилита логирует через библиотеку [`debug`](https://github.com/debug-js/debug).
По умолчанию логи выключены и включаются переменной окружения `DEBUG`:

```bash
# лог приложения (неймспейс page-loader)
DEBUG=page-loader* page-loader --output /var/tmp https://ru.hexlet.io/courses

# лог HTTP-запросов axios (через axios-debug-log)
DEBUG=axios page-loader https://ru.hexlet.io/courses

# всё вместе
DEBUG=page-loader*,axios page-loader https://ru.hexlet.io/courses
```

Пример вывода:

```
page-loader downloading https://ru.hexlet.io/courses into /var/tmp
axios GET https://ru.hexlet.io/courses
axios 200 https://ru.hexlet.io/courses
page-loader found 81 local resources
axios 200 https://ru.hexlet.io/packs/js/runtime.js
page-loader saved ru-hexlet-io-packs-js-runtime.js
page-loader page saved to /var/tmp/ru-hexlet-io-courses.html
```

Логирование nock в тестах: nock (начиная с v13) использует не `debug`, а
встроенный `util.debuglog` Node.js, поэтому включается через `NODE_DEBUG`:

```bash
DEBUG="page-loader*,axios" NODE_DEBUG="nock:*" npm test
```

## Аскинема

[Скачивание страницы](https://asciinema.org/a/8E8ycEpdMeFa1QaL): с указанной
директорией и с дефолтной (текущей), содержимое скачанных файлов, обработка
ошибок.

[Скачивание страницы с изображениями](https://asciinema.org/a/kXBIxO58OgLZvHaV):
директория `ru-hexlet-io-courses_files` со 134 скачанными изображениями,
переписанные ссылки на локальные файлы в HTML.

[Скачивание css/js и остальных локальных ресурсов](https://asciinema.org/a/HQg2BzF1ARMimQag):
81 файл в `_files` (стили, скрипты, иконки), переписанные `href` и `src`,
84 локализованные ссылки в HTML.

[Пример логирования](https://asciinema.org/a/QeGW9W229wGrCHQn): обычный
запуск без логов, запуск с `DEBUG="page-loader*,axios"` (логи приложения
и HTTP), логирование ошибки.

[Обработка ошибок](https://asciinema.org/a/FXP7U2tSix5Zbgj3): HTTP-ошибка
404 и ошибка доступа к директории — понятные сообщения в stderr и код
возврата 1 после каждого прогона.

[Прогресс загрузки ресурсов](https://asciinema.org/a/dh2P8M4hdLEU7UGK):
спиннеры listr по каждому из 81 ресурса (5 параллельно), отметки
завершения и итоговый путь к странице.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
