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

## Аскинема

[Демонстрация работы page-loader](https://asciinema.org/a/8E8ycEpdMeFa1QaL):
скачивание страницы с указанной директорией и с дефолтной (текущей),
содержимое скачанных файлов, обработка ошибок.

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
