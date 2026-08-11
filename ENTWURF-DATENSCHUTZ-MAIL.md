# Entwurf: E-Mail-Versand und Feedback in der Datenschutzerklärung

> **ERLEDIGT am 11. August 2026 (`4d50536`). Diese Datei ist nur noch Beleg,
> wie der Text zustande kam — nicht mehr Vorlage.**
>
> Der Text steht jetzt in `datenschutz.html`, in zwei Punkten aber **anders**
> als hier unten:
>
> - **„wird nicht in unserer Datenbank gespeichert" gilt nicht mehr.** Feedback
>   wird seit `f455ef4` gespeichert (erst speichern, dann mailen). Wer hier
>   abschreibt, trägt eine falsche Zusage in den Rechtstext. Siehe Abschnitt 4
>   dieser Datei — genau dieser Zusammenhang stand dort schon.
> - **Die Platzhalter sind gefüllt:** Plus Five Five, Inc. als Firmierung hinter
>   Resend, Übermittlung auf Grundlage des DPF-Angemessenheitsbeschlusses mit
>   ergänzenden Standardvertragsklauseln. Beide Angaben sind noch gegen die
>   Primärquellen zu halten — siehe `UEBERGABE-OFFEN.md`, Abschnitt 3.1.
>
> Was schon vorher eingetragen war: der Serverstandort in Abschnitt 5
> (Falkenstein, Deutschland). Das ist eine geprüfte Tatsache und keine Abwägung.

Stand: 10. August 2026. Gehört zu den offenen Punkten aus `UEBERGABE-OFFEN.md`,
Abschnitt 3.1.

---

## 1. Was geprüft wurde

Alles aus dem laufenden System, nicht aus der Erinnerung.

### Serverstandort — beantwortet

| Prüfung | Ergebnis |
|---|---|
| IP von movietaste.de | `167.233.54.20` |
| RIPE-Eintrag | netname `CLOUD-FSN1`, country `DE`, Hetzner Online GmbH |
| Hostname auf dem Server | `ubuntu-2gb-fsn1-1` |
| Rechenzentrum | `fsn1-dc14` |

**Falkenstein (Sachsen), Deutschland.** Nicht Finnland. Damit verlässt beim Hosting
nichts die EU — es gibt keine Drittlandübermittlung zu erklären. In Abschnitt 5
bereits ergänzt, zusammen mit der Anschrift von Hetzner.

### Mailversand — Anbieter bestätigt

Auf dem Server (`/opt/movietaste/backend/.env`):

```
MAIL_PROVIDER=resend
MAIL_FROM="MovieMatch <no-reply@movietaste.de>"
```

Versand über `https://api.resend.com/emails` ([backend/lib/mailer.js](backend/lib/mailer.js)).
Übermittelt werden Empfängeradresse und Mailinhalt.

### Abschnitt 6 stimmt in zwei Punkten nicht mehr mit dem Programm überein

**Genannt, existiert aber nicht:** „Registrierungs-E-Mails". Im Code gibt es nur
`sendPasswordResetMail` ([backend/lib/mailer.js:38](backend/lib/mailer.js)) — bei
der Registrierung geht keine Mail raus.

**Existiert, ist aber nirgends genannt:** Feedback-Mails
([backend/routes/feedback.js](backend/routes/feedback.js)). Das Wort „Feedback"
kommt in `datenschutz.html` überhaupt nicht vor — weder in Abschnitt 2 (welche
Daten), noch in 3 (Zwecke), noch in 6, noch in 10 (Speicherdauer). Was tatsächlich
passiert:

- Das Formular im Menü ist **ohne Anmeldung** benutzbar.
- Ist jemand angemeldet, wird die **E-Mail-Adresse des Kontos** automatisch
  mitgeschickt („zur besseren Zuordnung", ohne zusätzliches Formularfeld).
- Der Freitext geht bis **5.000 Zeichen** an `info@digital-wings.com`.
- Er wird **nicht in der Datenbank gespeichert** — er existiert nur als E-Mail.

Das wiegt schwerer als die fehlende Anbieternennung: Hier ist eine Verarbeitung
gar nicht beschrieben, und zwar eine mit Freitext, in den Leute alles Mögliche
schreiben.

---

## 2. Zwei offene Entscheidungen

Beide betreffen Verträge, nicht Code. Ich kann sie nicht für euch beantworten und
bin kein Anwalt — die Formulierungen gehören geprüft.

**a) Liegt ein Auftragsverarbeitungsvertrag mit Resend vor?**
Der Entwurf unten nennt Resend als Auftragsverarbeiter. Ohne AV-Vertrag stimmt
dieser Satz nicht.

**b) Auf welcher Grundlage geht die Übermittlung in die USA?**
Resend, Inc. sitzt in den USA. Wer den Namen nennt, muss auch die Grundlage
nennen — Angemessenheitsbeschluss (EU-US Data Privacy Framework, sofern Resend
zertifiziert ist) oder Standardvertragsklauseln. Was davon zutrifft, steht in
eurem Vertrag.

Die genaue Firmierung und Anschrift bitte aus dem AV-Vertrag übernehmen; ich habe
sie bewusst als Platzhalter gelassen, statt eine Adresse zu raten.

---

## 3. Entwurf

### Abschnitt 6 — vollständig ersetzen

```html
<h2>6. E-Mail-Versand und Feedback</h2>
<p>
  Wir versenden E-Mails in zwei Fällen: zum Zurücksetzen deines Passworts an die
  Adresse deines Kontos, und wenn du uns über das Feedback-Formular schreibst.
  Bei der Registrierung verschicken wir keine E-Mail.
</p>
<p>
  Für den Versand nutzen wir Resend (<!-- Firmierung und Anschrift aus dem
  AV-Vertrag -->) als Auftragsverarbeiter. Übermittelt werden die Adresse der
  empfangenden Person und der Inhalt der jeweiligen E-Mail. Der Anbieter hat
  seinen Sitz in den USA; die Übermittlung erfolgt auf Grundlage von
  <!-- Angemessenheitsbeschluss EU-US Data Privacy Framework ODER
       Standardvertragsklauseln nach Art. 46 Abs. 2 lit. c DSGVO -->.
</p>
<p>
  Das Feedback-Formular kannst du auch ohne Anmeldung nutzen. Bist du angemeldet,
  schicken wir die E-Mail-Adresse deines Kontos mit, damit wir dir antworten
  können; ohne Anmeldung erreicht uns dein Text ohne Absenderangabe. Deine
  Nachricht wird nicht in unserer Datenbank gespeichert, sondern ausschließlich
  per E-Mail an uns zugestellt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
  (berechtigtes Interesse an der Bearbeitung von Rückmeldungen).
</p>
```

### Abschnitt 2 — ein Listenpunkt dazu

```html
<li><strong>Feedback:</strong> der Text, den du im Feedback-Formular schreibst –
bei angemeldeten Personen zusammen mit der E-Mail-Adresse deines Kontos. Wird
nicht in unserer Datenbank gespeichert, sondern nur per E-Mail an uns zugestellt
(siehe Abschnitt 6).</li>
```

### Abschnitt 3 — ein Listenpunkt dazu

```html
<li><strong>Feedback:</strong> Bearbeitung und Beantwortung deiner Rückmeldung –
Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).</li>
```

### Abschnitt 10 — ein Absatz dazu

```html
<p>
  Feedback-Nachrichten liegen ausschließlich in unserem E-Mail-Postfach. Wir
  löschen sie, sobald das Anliegen erledigt ist, spätestens nach
  <!-- Frist festlegen, z. B. 12 Monaten -->.
</p>
```

---

## 4. Zwei Vorschläge, die über den Text hinausgehen

**Einen Hinweis ans Formular selbst.** Wer Freitext in ein Feld tippt, liest
vorher keine Datenschutzerklärung. Eine Zeile unter dem Feld — sinngemäß
„Angemeldet schicken wir deine E-Mail-Adresse mit, damit wir antworten können" —
wirkt dort, wo die Entscheidung fällt. Das ist eine Änderung in `index.html`,
kein Rechtstext.

**Feedback speichern oder bewusst nicht.** Heute ist die Nachricht weg, wenn
Resend den Versand nicht schafft (steht so in `UEBERGABE-OFFEN.md`, Abschnitt 4).
Falls ihr sie künftig in der Datenbank ablegt, stimmt der Satz „wird nicht in
unserer Datenbank gespeichert" nicht mehr — die beiden Punkte gehören zusammen
entschieden.
