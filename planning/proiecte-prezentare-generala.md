# Verbologic — trei proiecte, pe înțelesul tuturor

Data: 11 octombrie 2026 · Stare: descriere de produs, fără implementare

Documentul descrie, la nivel general, ce sunt cele trei proiecte, ce rezolvă, cum le trăiește utilizatorul și după ce reguli funcționează. Detaliile tehnice (furnizori, arhitectură, date, costuri, efort) sunt în planul separat: [plan-mentor-pronuntie-povesti.md](plan-mentor-pronuntie-povesti.md).

**Punctul de plecare comun.** Verbologic are deja un vocabular bogat și organizat: peste o mie de cuvinte și expresii românești pe capitole și niveluri (A1–C2), traduse în nouă limbi, cele mai multe cu transcriere fonetică (IPA) și clip audio. Utilizatorul poate marca un cuvânt ca „învățat”. Ce lipsește este partea activă: să **folosești** cuvintele (Mentor), să le **rostești** corect (Antrenor) și să le **întâlnești în context** (Povești). Cele trei proiecte acoperă exact aceste trei goluri.

---

## 1. Mentor AI conversațional

### Ce este

Un partener de conversație în limba pe care o înveți. La început scrii, iar mai târziu vorbești. Mentorul folosește **doar cuvintele pe care le-ai marcat ca învățate**, plus câteva cuvinte de legătură absolut necesare („și”, „la”, „eu”, „este”). Când greșești, te corectează pe loc, în contextul frazei tale, și îți explică pe scurt, în limba ta maternă.

### Ce problemă rezolvă

- Cine învață vocabular din liste ajunge să recunoască multe cuvinte, dar nu le poate folosi într-o conversație.
- Chatboții obișnuiți vorbesc „prea bine”: folosesc cuvinte necunoscute, iar începătorul se pierde.
- Un profesor uman e scump și rar disponibil exact când ai zece minute libere.

Mentorul e o conversație **pe măsura ta**: niciodată peste vocabularul tău, mereu cu feedback imediat. Este și promisiunea de pe prima pagină a site-ului („mentori AI interactivi”), care azi apare la Practice ca „În curând”.

### Pentru cine

- Începători și intermediari care au deja câteva zeci de cuvinte marcate și vor să treacă de la „recunosc” la „folosesc”.
- Cei care se jenează să vorbească cu un om și vor întâi un loc sigur unde să greșească.

### Cum arată pentru utilizator

1. **Alegi o conversație.** Vezi câte cuvinte ai învățat și pentru ce situații ajung. Situațiile vin din temele existente: „Salutări”, „La aeroport”, „Rutina zilnică”, „La piață”. Există și varianta de conversație liberă. Înainte să începi, vezi și cât costă sesiunea în credite.
2. **Conversezi.** Mentorul deschide discuția, adaptat situației. Orice cuvânt din replica lui poate fi atins ca să-i vezi traducerea, pronunția scrisă și să-l asculți.
3. **Primești corecturi în context.** Sub fraza ta apare discret ce era greșit, varianta corectă și de ce: acord, gen, diacritice, ordinea cuvintelor sau un cuvânt nepotrivit. Poți rescrie fraza pe loc sau poți spune „nu cred că e greșeală”.
4. **Închei cu un rezumat.** Vezi greșelile care se repetă, cuvintele pe care le-ai folosit corect și eventualele cuvinte noi. Primești și o recomandare: o temă de recapitulat sau o poveste de citit.

### Reguli de comportament

- **Vocabularul tău e granița.** Mentorul nu iese din cuvintele tale decât rar și controlat, cel mult un cuvânt nou la câteva replici, marcat și explicat.
- **Corectează ca un profesor bun, nu ca un corector automat.** Poți alege între „doar greșelile importante” și „tot”. Când nu e sigur, spune asta.
- **Explică în limba ta**, scurt, fără termeni de gramatică inutili.
- **Rămâne profesor.** Nu devine un chatbot general și nu discută subiecte nepotrivite. Readuce discuția la exercițiu.
- **Învață din tine.** Cuvintele folosite corect devin „mai sigure”, iar greșelile repetate revin mai târziu la recapitulare.

### Situații speciale

- **Ai prea puține cuvinte.** Mentorul îți spune câte îți mai trebuie și îți propune fie un pachet de început, fie un dialog ghidat, cu replici fixe.
- **Nu ai cont sau credite.** Vezi o conversație demonstrativă și ce trebuie să faci ca să începi.
- **Ai marcat cuvinte pe care nu le știi de fapt.** Se poate întâmpla, pentru că azi un cuvânt devine „învățat” și automat, după câteva ascultări, sau în bloc. Mentorul observă ce înțelegi și se adaptează.

### Varianta vocală (etapă ulterioară)

Aceeași conversație, dar vorbită: tu vorbești, mentorul îți răspunde cu voce. Regulile rămân aceleași (vocabularul tău, corecturi), iar în plus se poate semnala ușor un cuvânt pronunțat greșit. Aici Mentorul se întâlnește cu Antrenorul de pronunție.

### Etape

1. **Prima versiune:** română, în scris, câteva situații de bază și conversația liberă, cu corecturi și rezumat.
2. **Mai multe situații:** câte una pentru fiecare temă din vocabular. Greșelile intră în recapitularea periodică.
3. **Voce.**
4. **Alte limbi**, pe măsură ce au vocabular. Engleza are azi doar litere și sunete, nu și cuvinte.

### Cum știm că merge

- Oamenii duc conversațiile până la capăt și revin în zilele următoare.
- Mentorul rămâne aproape mereu în vocabularul utilizatorului.
- Corecturile sunt rar contestate, iar utilizatorii aplică corectura când rescriu.
- Cine folosește Mentorul rămâne mai mult pe platformă decât cine nu îl folosește.

### Ce poate merge prost

- **Corecturi greșite.** O corectură greșită strică încrederea mai repede decât zece corecte o construiesc. De aceea calitatea corecturilor în română se verifică înainte de lansare și apoi continuu.
- **Conversații sărace la început**, când vocabularul e mic.
- **Copiii.** Site-ul permite mai mulți utilizatori pe același calculator, deci trebuie reguli clare de siguranță.
- **Costul.** Fiecare replică are un cost real, deci Mentorul trebuie legat de conturi și credite.

---

## 2. Antrenor de pronunție

### Ce este

Asculți cum se spune un cuvânt, îl spui tu, iar aplicația îți arată **sunet cu sunet** ce ai rostit bine și ce nu. Te compară cu transcrierea fonetică a cuvântului și cu clipul audio deja existent. Primești un scor pe fiecare sunet și un sfat concret pentru cele greșite.

### Ce problemă rezolvă

- Poți învăța un cuvânt corect pe hârtie și să-l rostești greșit ani de zile, fără să afli vreodată.
- Feedbackul de tipul „corect / greșit” pe tot cuvântul nu te ajută: nu știi *ce* să schimbi.
- Româna are sunete care nu există în multe limbi (ă, â/î), iar engleza are multe diferențe între scris și rostit. Exact aici e nevoie de ghidare fină.

Antrenorul face concretă promisiunea de pe pagina Metodă: „progres urmărit literă cu literă, cuvânt cu cuvânt”.

### Pentru cine

- Oricine învață limba română: transcrierea fonetică și clipul există pentru aproape toate cuvintele din dicționar.
- Vorbitorii de română care învață engleză: traseul englez e construit chiar pe litere și sunete, cu transcriere și glosă în română.

### Cum arată pentru utilizator

1. **Pornești de oriunde.** Lângă fiecare cuvânt din dicționar există un microfon. Din lecțiile despre sunete, butonul „Exersează aceste sunete” deschide exercițiul. Poți porni și din rezumatul unei conversații sau al unei povești („3 cuvinte de exersat”).
2. **Asculți și repeți.** Vezi cuvântul, traducerea, transcrierea împărțită pe sunete și butonul de ascultare. Apeși și vorbești.
3. **Vezi rezultatul.** Fiecare sunet e colorat: verde, galben sau roșu. Pentru cele roșii afli ce ai spus în loc („ai spus «e» în loc de «ă»”) și cum să-l corectezi, cu o comparație cu un sunet pe care îl cunoști deja. Poți asculta modelul, apoi pe tine însuți, și încerca din nou.
4. **Exersezi pe teme:** zece cuvinte dintr-o temă, cu un rezumat al sunetelor problematice la final.
5. **Îți urmărești progresul pe o „hartă a sunetelor”**, cu toate sunetele limbii colorate după cât de bine le stăpânești. Apeși pe un sunet și primești cuvinte care îl conțin.

### Reguli de comportament

- **Încurajează, nu pedepsește.** Mai bine scapă o greșeală mică decât să marcheze greșit un sunet corect. Notele mici formulate dur fac oamenii să renunțe.
- **E sincer când nu e sigur.** Dacă e zgomot sau înregistrarea e proastă, spune „nu te-am auzit bine” și nu inventează un scor.
- **Arată progresul în timp**, de exemplu: „sunetul ă: de la 42 la 71 în ultima săptămână”.
- **Nu păstrează vocea ta implicit.** Înregistrarea se folosește pentru scor și apoi se șterge, dacă nu alegi explicit altceva.

### Situații speciale

- Nu ai dat voie la microfon, sau nu ai microfon: primești instrucțiuni clare, iar exercițiile de ascultare rămân disponibile.
- Ai spus cu totul alt cuvânt: aplicația îți spune asta, nu îți dă note fără sens pe sunete.
- Ai epuizat încercările gratuite ale zilei: afli când se reînnoiesc sau cum continui.

### Etape

1. **Prima versiune:** cuvinte izolate din dicționarul românesc și literele/sunetele din traseul englez, cu scor pe sunet și sfaturi.
2. **Accentul și ritmul** („accentul cade pe a doua silabă”), harta sunetelor și exerciții țintite pe sunetele slabe.
3. **Propoziții întregi**, inclusiv cele din lecții și din povești. Pronunția devine parte din Mentorul vocal.
4. **Antrenor care funcționează și fără internet**, plus alte limbi.

### Cum știm că merge

- Scorurile aplicației seamănă cu ce ar spune un profesor nativ ascultând aceeași înregistrare.
- Rezultatul apare aproape instant, sub o secundă și jumătate.
- Oamenii revin să exerseze, iar scorurile pe sunetele dificile cresc vizibil în câteva zile.
- Puține încercări eșuează din motive tehnice (liniște, zgomot, microfon).

### Ce poate merge prost

- **Precizia** pentru accente străine puternice, voci de copii și microfoane slabe. Este riscul principal și trebuie testat devreme, înainte de orice promisiune publică.
- **Clipurile de referință par să fie o singură voce**, posibil sintetică. Antrenorul nu trebuie să te penalizeze doar pentru că ai alt timbru.
- **Datele de pornire:** unele transcrieri existente pot avea greșeli. Antrenorul le poate și depista, ca efect secundar util.
- **Confidențialitatea vocii.** E nevoie de reguli clare și comunicate deschis.

---

## 3. Povești

### Ce este

Texte scurte, scrise **din vocabularul deja existent pe site**, cu doar câteva cuvinte noi, pe nivelul tău. Fiecare poveste are audio (o voce care citește, cu textul evidențiat pe măsură ce e rostit) și câteva întrebări de înțelegere la final. Traseul „Povești” apare deja în navigație, cu 48 de teme pe niveluri (de la „Fabule și povești cu animale” la A1 până la „Filosofie” la C2), dar azi are zero intrări.

### Ce problemă rezolvă

- Cuvintele învățate izolat se uită repede. Întâlnite într-o poveste, capătă sens și se fixează.
- Textele autentice sunt prea grele pentru începători, iar cele „pentru cursanți” sunt rar legate de ce ai învățat tu concret.
- Un traseu gol în meniu dă impresia de produs neterminat.

Poveștile sunt locul unde vocabularul devine **lectură plăcută** și unde îți verifici înțelegerea fără presiune.

### Pentru cine

- Toți cursanții de română, de la A1 în sus. Prima etapă se concentrează pe nivelurile de început, unde e cel mai mare public.
- Cei care preferă să învețe citind și ascultând decât din liste.

### Cum arată pentru utilizator

1. **Alegi o poveste** din lista organizată ca restul site-ului, pe secțiuni și teme. Pe fiecare poveste vezi nivelul, durata și o etichetă personală: „Cunoști 94% din cuvinte”. Poți filtra după „potrivite pentru mine”: povești în care știi aproape totul, dar nu chiar tot.
2. **Citești și asculți.** Vocea citește, iar textul se evidențiază cuvânt cu cuvânt. Poți încetini sau repeta o propoziție. Atingi orice cuvânt ca să-i vezi traducerea și să-l asculți, să-l marchezi ca învățat sau să-i exersezi pronunția. Cuvintele noi pentru tine sunt subliniate discret.
3. **Răspunzi la întrebări**, trei până la cinci: alegere din variante, adevărat/fals, ordinea întâmplărilor, ce înseamnă un cuvânt în context. Răspunsul te trimite la propoziția din text unde se afla.
4. **Închei.** Vezi scorul și cuvintele noi întâlnite, pe care le poți marca toate odată. Primești sugestii: „discută povestea cu mentorul”, „exersează aceste 5 cuvinte” și povestea următoare potrivită.

### De unde vin poveștile

- **Catalog pregătit dinainte** (prima etapă). Poveștile se scriu cu ajutorul fluxului cu două modele AI pe care Verbologic îl folosește deja: unul scrie, celălalt verifică gramatica, nivelul și coerența. Apoi un **editor uman nativ** citește, corectează și aprobă fiecare poveste înainte de publicare. Site-ul are deja stările „Ciornă — de revizuit” și „Revizuit” pentru lecții, iar poveștile le folosesc la fel.
- **Povești personalizate** (etapă ulterioară), scrise la cerere doar din cuvintele tale. Sunt verificate automat, dar fără editor uman, deci marcate ca „generate automat”, cu buton de raportare. Ar costa credite.

### Reguli de conținut

- **Aproape totul cunoscut, puțin nou:** majoritatea cuvintelor sunt de pe nivelul respectiv sau dinainte, iar cuvintele noi sunt puține și explicate.
- **Româna trebuie să fie naturală și corectă**, inclusiv diacriticele și accentul în audio.
- **Conținutul e potrivit vârstei** în secțiunile pentru începători. Temele sensibile (război, religie, relații) vin mai târziu, cu grijă editorială.
- **Drepturile de autor se respectă:** la „Clasici repovestiți” și „Capodopere” se folosesc doar texte libere de drepturi sau repovestiri originale.

### Situații speciale

- Temă încă fără povești: rămâne mesajul „în curând”, dar doar acolo.
- Utilizator care n-a marcat niciun cuvânt: vede nivelul poveștii în loc de procentul de cuvinte cunoscute și primește recomandări pentru începători.
- Audio indisponibil: textul și întrebările funcționează normal.
- Ai găsit o greșeală: o raportezi direct pe propoziție, iar editorul o primește.

### Etape

1. **Prima versiune:** câteva zeci de povești pentru începători (A1–A2), cu audio, evidențiere, cuvinte atingibile și întrebări.
2. **Niveluri intermediare** (B1–B2), traducerea propozițiilor, progres păstrat în cont și raportare de greșeli.
3. **Povești personalizate** și legătura cu Mentorul.
4. **Niveluri avansate**, ilustrații și alte limbi.

### Cum știm că merge

- Oamenii termină poveștile pe care le încep și citesc mai mult de una în prima săptămână.
- Scorurile la întrebări sunt bune, dar nu perfecte. Asta arată că nivelul e potrivit.
- Din povești se marchează cuvinte noi ca învățate.
- Se raportează rar greșeli, iar editorii țin pasul cu publicarea.

### Ce poate merge prost

- **Calitatea limbii.** Textele scrise cu AI pot suna nefiresc. Revizia umană e obligatorie pentru catalog.
- **Ritmul de publicare** depinde de timpul editorilor, nu de AI.
- **Pronunția în audio:** vocea sintetică poate pune accentul greșit pe unele cuvinte. Revizia include și ascultarea.
- **Engleza:** nu are încă vocabular de cuvinte, deci poveștile în engleză așteaptă un dicționar englez.

---

## Cum se leagă cele trei proiecte

Proiectele sunt trei fețe ale aceluiași parcurs: **citești** cuvintele în povești, le **rostești** cu Antrenorul și le **folosești** cu Mentorul. Fiecare îl trimite pe utilizator spre celelalte:

- Din poveste: „discută povestea cu mentorul” și „exersează aceste cuvinte”.
- Din conversație: „citește o poveste despre asta” și „exersează pronunția cuvintelor greșite”.
- Din Antrenor: recomandări de povești și conversații care conțin sunetele tale slabe.

Toate trei folosesc aceleași lucruri de bază:

- **Vocabularul existent**, cu traduceri, transcrieri și audio.
- **Marcajul „învățat”**, care trebuie să devină mai de încredere: să se știe dacă l-ai pus tu, a fost pus automat sau a fost confirmat prin folosire.
- **O hartă a formelor cuvintelor românești.** Dacă știi „copil”, trebuie să se recunoască și „copilul” sau „copiii”.
- **Conturile și creditele.** Azi conturile nu sunt active, iar creditele sunt doar demonstrative.
- **Recapitularea periodică** promisă pe pagina Metodă, alimentată din greșelile făcute în toate trei.

**Ordinea recomandată:**

1. **Fundațiile:** conturi active, credite reale și harta formelor cuvintelor.
2. **Povești**, primele. Nu costă nimic per utilizator, nu depind de plăți și umplu un traseu vizibil gol.
3. **Antrenorul de pronunție.** Folosirea lui costă foarte puțin și se sprijină direct pe transcrierile și clipurile existente. Testul tehnic începe încă de la pasul 1, pentru că e cea mai mare necunoscută.
4. **Mentorul**, ultimul. Depinde cel mai mult de conturi, credite și reguli de siguranță.

**De lămurit înainte:**

- Cum se împacă oferta „plătești o dată, păstrezi pentru totdeauna” cu funcțiile care costă la fiecare folosire, precum Mentorul. Propunerea din planul tehnic: Mentorul consumă mereu credite, iar Poveștile din catalog și o cotă zilnică de pronunție sunt incluse.
- Dacă publicul include copii. Asta schimbă regulile de siguranță, de păstrare a datelor și de conținut.
