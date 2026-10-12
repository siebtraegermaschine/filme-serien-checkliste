// Pilot-Texte fuer en-gb und es-es (je 10 Titel), geschrieben aus dem Datensatz
// (Faktenregel wie seo-batch.mjs). NICHT in die Produktions-DB eingespielt:
// beide Locales sind noindex, das Einspielen ist eine Entscheidung fuer spaeter
// (siehe STATUS.md). Einspielen: Eintraege wie in seo-content-daten.mjs per
// seo-content-laden.mjs bzw. direkt in seo_content (bereich 'titel').

const E = (schluessel, text) => ({ bereich: 'titel', schluessel, locale: 'en-gb', text });
const S = (schluessel, text) => ({ bereich: 'titel', schluessel, locale: 'es-es', text });

export const EINTRAEGE = [
  // ------------------------------------------------------------ en-gb
  E('movie:157336', `### What it is about
Interstellar is a 2014 science fiction adventure drama directed by Christopher Nolan. Its premise is stark: humanity is close to perishing through a global food shortage, and the only hope left is a secret project of the US government, led by the resourceful Professor Brand. The plan is an expedition to another star system, where habitable planets, raw materials and, above all, life are suspected to exist.

Cooper, an engineer and former NASA pilot, and Brand's daughter Amelia lead the crew. Their route runs through wormholes, which are almost entirely unexplored, so nobody can say with certainty what waits on the other side, or whether and when the travellers will come back to Earth. Cooper's children, his daughter Murph and his son Tom, have to stay behind with their grandfather Donald and hope for their father's return.

### How it came about
Our records give the release year, 2014, and the director, Christopher Nolan, but no account of how the project was developed, so this page does not invent one. What can be said is how the film is catalogued: three genres (adventure, drama and science fiction) and one keyword, time travel. That combination points to a story in which the journey and its consequences for the people left behind matter at least as much as the destination.

### Behind the scenes
The leading cast is Matthew McConaughey, Anne Hathaway, Michael Caine and Jessica Chastain. The synopsis names Cooper, Amelia Brand, Professor Brand, Murph, Tom and Donald, and it frames the story as a family drama as much as an expedition: the crew sets out, the children wait. Nolan is the director credited in our data. Production details such as locations, effects or shooting schedules are not part of the record and are therefore left out here.

### Context and impact
Viewers have given Interstellar an average rating of 8.5 out of 10. In Germany it carries an age rating of 12. If you are drawn to science fiction that keeps a human story at its centre, or if you want to explore more of the director's work, this is an easy title to add to your Watchlist.`),

  E('movie:27205', `### What it is about
Inception is a 2010 action, science fiction and adventure film directed by Christopher Nolan. Cobb and his associates try to break into the subconscious of the industrialist Saito, and they run into unexpected difficulties. Saito has trained defences against the theft of thoughts and now builds up a barrier of his own. In the end it is the betrayal of a colleague that makes the attempt fail, the attempt being to coax secrets out of a sleeping man.

Because his clients demanded absolute success, Cobb has to flee. A looming conviction means he cannot return to the United States, but Saito gets to him first. He has not come to punish him, however: he has come to propose a deal.

### How it came about
The data we hold for this film covers its year, 2010, its director and its cast, but it says nothing about how the idea took shape or how long the project took to develop. This page therefore sticks to what is documented. The genre labels are action, science fiction and adventure, and the setting of the story, the subconscious of a sleeping person, is what gives the film its distinctive premise.

### Behind the scenes
Christopher Nolan directed the film. The leading cast consists of Leonardo DiCaprio, Joseph Gordon-Levitt, Ken Watanabe and Tom Hardy. The synopsis introduces Cobb as the one who leads the team and Saito as the target who turns into a client, which gives the cast a clear dynamic of pursuit and negotiation. Further production information is not recorded and is not guessed at here.

### Context and impact
Inception has an average rating of 8.4 out of 10 among viewers. In Germany it is rated for ages 12 and over. Where it appears in a ranking depends on the list you look at, so we do not make claims about its standing. If you enjoy heist-like plots set in unusual surroundings, it fits comfortably on a Watchlist alongside other science fiction thrillers.`),

  E('movie:24428', `### What it is about
The Avengers (released in some countries as Marvel's The Avengers) is a 2012 science fiction, action and adventure film directed by Joss Whedon. It brings together some of the best-known Marvel characters in one team: Iron Man, the incredible Hulk, Thor, Captain America, Hawkeye and Black Widow.

The trigger is the appearance of an unexpected enemy who threatens the peace and security of the world. Nick Fury, the director of the international peacekeeping agency S.H.I.E.L.D., realises he needs a team to save the planet from the brink of disaster. A bold recruitment effort begins, stretching from one end of the earth to the other. Once the team is assembled, Fury and his trusted assistant, Agent Coulson, must convince the heroes to live and work together and to use their extraordinary powers against the dangerous Loki, who has gained access to the Tesseract and its unlimited power.

### How it came about
Our data lists the year, 2012, and the director, Joss Whedon, but it contains no development history. The keywords attached to the film (comic adaptation, superhero team, alien invasion, New York and shield) show where it comes from and what it is about, and that is as far as this page goes.

### Behind the scenes
The leading cast is Robert Downey Jr., Chris Evans, Mark Ruffalo and Chris Hemsworth. Because the premise is an ensemble, the synopsis spends as much time on the persuasion of the heroes as on the threat itself. Details on effects, locations or the shoot are not part of the record and are therefore not included.

### Context and impact
The average rating among viewers is 8.1 out of 10, and the film carries an age rating of 12 in Germany. It is a sensible starting point if you want to begin with the team-up rather than the individual hero films, and it is easy to place on a Watchlist next to other comic adaptations.`),

  E('movie:155', `### What it is about
The Dark Knight is a 2008 action, thriller and crime film directed by Christopher Nolan. Together with district attorney Harvey Dent and Lieutenant James Gordon, the billionaire Bruce Wayne, who acts in a bat costume, tries to put an end to crime in Gotham City.

Then, seemingly out of nowhere, a psychotic super-criminal appears: the Joker. In his delusional vision he wants to plunge the city into chaos and anarchy, and Batman seems to be the only one who can stop him. Before the final showdown arrives, much blood will be spilled, and people close to Bruce Wayne could become victims as well.

### How it came about
The data we hold names the release year, 2008, and the director, Christopher Nolan, together with the keyword superhero. It does not document how the film was developed, and this page does not make that up. The three genres, action, thriller and crime, are a reasonable guide to what to expect: a superhero story told largely as a crime thriller about a city.

### Behind the scenes
The leading cast is Christian Bale, Heath Ledger, Aaron Eckhart and Michael Caine. The synopsis structures the story around three figures who work for order, Wayne, Dent and Gordon, and one who works against it. Anything beyond that, such as production methods or on-set stories, is not recorded in our data and is left out.

### Context and impact
Viewers have rated the film 8.5 out of 10 on average. Its age rating in Germany is 16, which is higher than for many superhero films and reflects the darker tone described in the synopsis. If you like crime thrillers as much as comic adaptations, it makes a natural addition to your Watchlist.`),

  E('movie:19995', `### What it is about
Avatar is a 2009 science fiction, action and adventure film directed by James Cameron. Jake Sully is a marine confined to a wheelchair who agrees to move to the planet Pandora, taking the place of his dead brother, whose mission was to explore it.

The atmosphere of Pandora is toxic for humans, so beings similar to the native Na'vi have been created, and humans can steer them. Pandora is also a huge deposit of a mineral that is precious to Earth, where energy sources have run out, and the Na'vi have no intention of being colonised. The first task of Jake's avatar is to learn the customs of the indigenous communities and to be accepted by them. There he meets Neytiri, a Na'vi warrior and the daughter of the tribal chief. From her he learns to become a warrior very different from the marine he used to be, and he falls in love with her, and she with him.

### How it came about
Our data records the year, 2009, and the director, James Cameron. How the film was developed is not part of the record, so it is not described here. The keywords attached to it (paraplegic, culture clash, closeness to nature, indigenous people, space colony and space travel) give a good picture of the themes it deals with.

### Behind the scenes
The leading cast is Sam Worthington, Zoe Saldaña, Sigourney Weaver and Stephen Lang. Technical details about the production are not recorded in our data and are not guessed at.

### Context and impact
The average viewer rating is 7.6 out of 10, and the film is rated 12 in Germany. It suits viewers who like science fiction with a clear conflict between a colonising power and a local community, and it can sit on a Watchlist next to other large-scale adventure films.`),

  E('movie:293660', `### What it is about
Deadpool is a 2016 action, adventure and comedy film directed by Tim Miller. To escape certain death from cancer, Wade Wilson agrees to a risky experiment that is meant to cure him and turn him into a super-mercenary.

He pays for his survival, however, with severe suffering and physical disfigurement. Driven by revenge, and made almost immortal by his self-healing powers, Wilson now hunts his tormentors as the mutant Deadpool. In doing so he endangers his great love, Vanessa, whom he banished from his life out of shame after his transformation.

### How it came about
The data we hold gives the release year, 2016, and the director, Tim Miller. It does not describe how the film was developed, and this page does not invent a history. The keywords (anti-hero, mercenary, superhero, comic adaptation and a scene after the credits) show how the film is classified and what it plays with.

### Behind the scenes
The leading cast is Ryan Reynolds, Morena Baccarin, Ed Skrein and T.J. Miller. The synopsis already hints at a mixture of tones: a revenge plot and a love story told in the genres of action, adventure and comedy. As the keywords list a scene after the credits, it is worth staying until the end. Production details are not part of our record and are therefore left out.

### Context and impact
Viewers give the film an average rating of 7.6 out of 10. It carries an age rating of 16 in Germany, which tells you that it is aimed at an adult audience rather than at families. If you want a superhero film that leans towards comedy and an anti-hero, it is an easy choice for your Watchlist.`),

  E('movie:299536', `### What it is about
Avengers: Infinity War is a 2018 adventure, action and science fiction film directed by Joe Russo. The Avengers and their allies have continued to protect the world from threats too large for any one hero to handle, and now a new danger has emerged from the cosmic shadows: Thanos.

He is a despot of intergalactic infamy, and his goal is to collect all six Infinity Stones, artefacts of unimaginable power, and to use them to impose his twisted will on all of reality. Everything the Avengers have fought for has led up to this moment, and the fate of Earth and of existence itself has never been more uncertain.

### How it came about
The record for this film contains the year, 2018, and the director, Joe Russo. It does not document how the film was planned or developed, and this page therefore does not describe it. The synopsis does make clear that the film builds on what came before it: it speaks of everything the Avengers have fought for leading up to this moment.

### Behind the scenes
The leading cast is Robert Downey Jr., Chris Evans, Chris Hemsworth and Josh Brolin. The synopsis sets a large group of heroes against a single opponent who collects the Infinity Stones, which gives the story a clear structure. Information on effects, locations or the shoot is not in our data and is not guessed at.

### Context and impact
Viewers rate the film 8.2 out of 10 on average, and in Germany it is rated for ages 12 and over. Because it follows on from earlier films about the same characters, it is best seen by viewers who already know the team. If that is you, it fits naturally on a Watchlist alongside the other superhero titles.`),

  E('movie:550', `### What it is about
Fight Club is a 1999 drama and thriller directed by David Fincher. A man of thirty is discontented with everything and can no longer sleep at night. Looking for somewhere to unload his anxiety, he starts attending courses at which groups of seriously ill people meet and confess their situations to one another.

While he gives in to emotion and tears at what he sees, he meets first Marla Singer and then Tyler Durden. She is a young woman who is also adrift and unable to make choices or decisions; he is determined and vigorous, with a precise idea in his head. Tyler blows up the man's flat and the two move into a dilapidated house together. Set on drawing him into his project, Tyler brings him into a Fight Club, a large underground room where people meet to beat one another up and so feel alive again.

### How it came about
The data we hold records the year, 1999, and the director, David Fincher, but it does not describe how the film came to be made. This page does not add an origin story that the record cannot support. The two genres, drama and thriller, suggest what the synopsis already shows: a psychological story first and foremost.

### Behind the scenes
The leading cast is Edward Norton, Brad Pitt, Helena Bonham Carter and Meat Loaf. Production details are not in our record and are left out.

### Context and impact
The average viewer rating is 8.4 out of 10. In Germany the film is rated 18, so it is clearly aimed at adults. It is a good fit for a Watchlist if you prefer dark, character-driven stories to plot-heavy spectacle.`),

  E('movie:278', `### What it is about
The Shawshank Redemption (German title: Die Verurteilten) is a 1994 drama and crime film directed by Frank Darabont. In 1946, Andy Dufresne, a young and successful banker, has his life changed radically when he is convicted of a crime he never committed: the murder of his wife and her lover.

He is sent to a prison that is every inmate's nightmare, Shawshank State Penitentiary in Maine, where he is to serve a life sentence. Andy is soon introduced to Warden Norton, the corrupt and cruel prison official, who uses the Bible as a means of control, and to Captain Byron Hadley, who treats the inmates like animals. Andy makes friends with Ellis Boyd Redding, a prisoner who has been serving his sentence for twenty years and who controls the institution's black market.

### How it came about
Our data records the year, 1994, and the director, Frank Darabont. It does not describe the development of the film, so this page does not do so either. Its two genres, drama and crime, fit the synopsis: a wrongful conviction and the world of a prison.

### Behind the scenes
The leading cast is Tim Robbins, Morgan Freeman, Bob Gunton and William Sadler. The synopsis builds the story around a handful of relationships inside the prison: a new inmate, a cruel authority and a friendship with a long-serving prisoner. Other production details are not part of our record and are not guessed at.

### Context and impact
The average viewer rating is 8.7 out of 10, and the film is rated 12 in Germany. If you enjoy stories about injustice and friendship told at a measured pace, it is a dependable pick for your Watchlist.`),

  E('movie:680', `### What it is about
Pulp Fiction is a 1994 thriller, crime and comedy film directed by Quentin Tarantino. Jules and Vincent are two hitmen with very little sense who work for Marsellus Wallace. Vincent confides in Jules that Marsellus has asked him to look after Mia, his wife.

Jules recommends caution, because it is very dangerous to overstep the mark with the boss's girlfriend. When it is time to work, both men have to get down to business. Their mission is to recover a mysterious briefcase.

### How it came about
The data we hold for this film gives the release year, 1994, and the director, Quentin Tarantino. It contains no information on how the project was developed, and this page does not invent any. The three genres listed, thriller, crime and comedy, already describe the unusual mix the film is known for in its own category: criminals who are also funny.

### Behind the scenes
The leading cast is John Travolta, Samuel L. Jackson, Uma Thurman and Bruce Willis. The synopsis centres on two characters, Jules and Vincent, and on the people they work for and look after. Details on the shoot, the script or the music are not part of our record and are therefore left out.

### Context and impact
Viewers have given the film an average rating of 8.5 out of 10. In Germany it is rated 16. It is a natural choice for a Watchlist if you like crime films with a sense of humour, and you can compare it with other titles by the same director once you have seen it.`),

  // ------------------------------------------------------------ es-es
  S('movie:157336', `### De qué trata
Interstellar es una película de aventuras, drama y ciencia ficción de 2014 dirigida por Christopher Nolan. Su punto de partida es crudo: la humanidad está a punto de perecer por una escasez mundial de alimentos, y la única esperanza es un proyecto secreto del Gobierno de Estados Unidos dirigido por el ingenioso profesor Brand. El plan consiste en enviar una expedición a otro sistema estelar, donde se sospecha que existen planetas habitables, materias primas y, sobre todo, vida.

Cooper, ingeniero y antiguo piloto de la NASA, y Amelia, la hija de Brand, encabezan la tripulación. Su ruta atraviesa agujeros de gusano, apenas explorados, de modo que nadie puede decir con certeza qué les espera al otro lado ni si los viajeros volverán a la Tierra ni cuándo. Los hijos de Cooper, Murph y Tom, deben quedarse con su abuelo Donald y esperar el regreso de su padre.

### Cómo surgió
Nuestros datos recogen el año, 2014, y al director, Christopher Nolan, pero no cuentan cómo se desarrolló el proyecto, así que esta página no se inventa nada. Sí se puede decir cómo está catalogada: tres géneros (aventuras, drama y ciencia ficción) y una palabra clave, viaje en el tiempo. Esa combinación apunta a una historia en la que el viaje y sus consecuencias para quienes se quedan importan tanto como el destino.

### Detrás de las cámaras
El reparto principal lo forman Matthew McConaughey, Anne Hathaway, Michael Caine y Jessica Chastain. La sinopsis nombra a Cooper, Amelia, el profesor Brand, Murph, Tom y Donald, y plantea la historia tanto como un drama familiar como una expedición: la tripulación parte y los hijos esperan. Los detalles de producción, como localizaciones, efectos o calendario de rodaje, no figuran en el registro y por eso no se mencionan.

### Contexto y repercusión
Los espectadores le dan una nota media de 8,5 sobre 10. En Alemania tiene una clasificación por edades de 12 años. Si te atrae la ciencia ficción con una historia humana en el centro, es un título fácil de añadir a tu Watchlist.`),

  S('movie:27205', `### De qué trata
Origen (título original: Inception) es una película de acción, ciencia ficción y aventuras de 2010 dirigida por Christopher Nolan. Dom Cobb es un ladrón hábil, el mejor de todos, especializado en el peligroso arte de la extracción: el robo de secretos valiosos desde las profundidades del subconsciente durante el estado de sueño, cuando la mente está más vulnerable.

Esta habilidad excepcional lo ha convertido en un jugador codiciado en el traicionero nuevo mundo del espionaje corporativo, pero al mismo tiempo en un fugitivo internacional que ha tenido que sacrificar todo lo que le importaba. Ahora se le ofrece una oportunidad para redimirse: con un último trabajo podría recuperar su vida anterior, pero solo si logra lo imposible.

### Cómo surgió
Los datos que tenemos de la película recogen el año, 2010, el director y el reparto, pero no dicen nada sobre cómo nació la idea ni cuánto duró el desarrollo. Esta página se limita, por tanto, a lo documentado. Los géneros son acción, ciencia ficción y aventuras, y el escenario del relato, el subconsciente de una persona dormida, es lo que da a la película su premisa singular.

### Detrás de las cámaras
Christopher Nolan dirigió la película. El reparto principal está formado por Leonardo DiCaprio, Joseph Gordon-Levitt, Ken Watanabe y Tom Hardy. La sinopsis presenta a Cobb como el hombre que ha pagado un precio muy alto por su talento y que ahora tiene una última oportunidad, lo que da al conjunto una dinámica clara de encargo y riesgo. No hay más información de producción registrada y aquí no se supone nada.

### Contexto y repercusión
La nota media de los espectadores es de 8,4 sobre 10, y en Alemania está clasificada para mayores de 12 años. Si te gustan las tramas de atracos ambientadas en escenarios poco habituales, encaja bien en una Watchlist junto a otros thrillers de ciencia ficción.`),

  S('movie:24428', `### De qué trata
Vengadores (título original: The Avengers) es una película de ciencia ficción, acción y aventuras de 2012 dirigida por Joss Whedon. Reúne en un solo equipo a algunos de los personajes más conocidos de Marvel: Iron Man, el increíble Hulk, Thor, el Capitán América, Ojo de Halcón y la Viuda Negra.

El detonante es la aparición de un enemigo inesperado que amenaza la tranquilidad y la seguridad del mundo. Nick Fury, director de la agencia internacional para el mantenimiento de la paz conocida como S.H.I.E.L.D., necesita un equipo que salve el planeta del borde del desastre. Así comienza, de un extremo a otro de la Tierra, un audaz trabajo de reclutamiento. Una vez reunido el equipo, Fury y su fiel asistente, el agente Coulson, tendrán que convencer a los superhéroes de que convivan y trabajen juntos, y de que usen sus increíbles poderes contra el peligroso Loki, que ha logrado acceder al Teseracto y a su poder ilimitado.

### Cómo surgió
Nuestros datos indican el año, 2012, y al director, Joss Whedon, pero no incluyen historia de desarrollo alguna. Las palabras clave asociadas (adaptación de cómic, equipo de superhéroes, invasión alienígena, Nueva York y escudo) muestran de dónde viene y de qué trata, y hasta ahí llega esta página.

### Detrás de las cámaras
El reparto principal lo forman Robert Downey Jr., Chris Evans, Mark Ruffalo y Chris Hemsworth. Al ser el planteamiento coral, la sinopsis dedica tanto espacio a convencer a los héroes como a la amenaza en sí. Los detalles sobre efectos, localizaciones o rodaje no constan en el registro y no se incluyen.

### Contexto y repercusión
La nota media de los espectadores es de 8,1 sobre 10 y la película tiene en Alemania una clasificación de 12 años. Es un buen punto de partida si prefieres empezar por el equipo y no por las películas de cada héroe, y se coloca fácilmente en una Watchlist junto a otras adaptaciones de cómic.`),

  S('movie:155', `### De qué trata
El caballero oscuro (título original: The Dark Knight) es una película de acción, thriller y crimen de 2008 dirigida por Christopher Nolan. Junto con el fiscal del distrito Harvey Dent y el teniente James Gordon, el multimillonario Bruce Wayne, que actúa con un traje de murciélago, intenta poner fin al crimen en Gotham City.

De pronto, de la nada, aparece un supercriminal psicótico: el Joker. En su visión delirante quiere sumir la ciudad en el caos y la anarquía, y Batman parece el único capaz de detenerlo. Antes de que llegue el enfrentamiento final correrá mucha sangre, y también personas cercanas a Bruce Wayne podrían convertirse en víctimas.

### Cómo surgió
Los datos que manejamos nombran el año, 2008, y al director, Christopher Nolan, junto con la palabra clave superhéroe. No documentan cómo se desarrolló la película, y esta página no lo inventa. Los tres géneros, acción, thriller y crimen, orientan bien sobre lo que cabe esperar: una historia de superhéroes contada en buena parte como un thriller criminal sobre una ciudad.

### Detrás de las cámaras
El reparto principal lo forman Christian Bale, Heath Ledger, Aaron Eckhart y Michael Caine. La sinopsis organiza el relato en torno a tres figuras que trabajan por el orden, Wayne, Dent y Gordon, y a una que trabaja contra él. Nada más, como métodos de producción o anécdotas de rodaje, figura en nuestros datos, así que se omite.

### Contexto y repercusión
Los espectadores le dan una nota media de 8,5 sobre 10. Su clasificación por edades en Alemania es de 16 años, más alta que la de muchas películas de superhéroes, en consonancia con el tono más oscuro de la sinopsis. Si te gustan tanto los thrillers criminales como las adaptaciones de cómic, es una incorporación natural a tu Watchlist.`),

  S('movie:19995', `### De qué trata
Avatar es una película de ciencia ficción, acción y aventuras de 2009 dirigida por James Cameron. Jake Sully es un marine en silla de ruedas que acepta trasladarse al planeta Pandora para sustituir a su hermano fallecido, cuya misión era explorarlo.

La atmósfera de Pandora es tóxica para los humanos, por lo que se han creado seres similares a los nativos na'vi que los humanos pueden manejar. Pandora es además un enorme yacimiento de un mineral valioso para la Tierra, donde las fuentes de energía se han agotado, y los na'vi no tienen intención de ser colonizados. La primera tarea del avatar de Jake será conocer los usos y costumbres de las comunidades indígenas y lograr que lo acepten. Allí conoce a Neytiri, una guerrera na'vi e hija del jefe de la tribu. De ella aprende a ser un guerrero muy distinto del marine que fue, y se enamora de ella, que le corresponde.

### Cómo surgió
Nuestros datos recogen el año, 2009, y al director, James Cameron. El desarrollo de la película no consta en el registro, por lo que no se describe aquí. Las palabras clave asociadas (parálisis, choque cultural, vínculo con la naturaleza, pueblos indígenas, colonia espacial y viaje espacial) dan una buena idea de los temas que aborda.

### Detrás de las cámaras
El reparto principal lo forman Sam Worthington, Zoe Saldaña, Sigourney Weaver y Stephen Lang. Los detalles técnicos de la producción no figuran en nuestros datos y no se suponen.

### Contexto y repercusión
La nota media de los espectadores es de 7,6 sobre 10 y la película tiene una clasificación de 12 años en Alemania. Encaja con quienes disfrutan de la ciencia ficción con un conflicto claro entre una potencia colonizadora y una comunidad local, y puede ocupar un lugar en la Watchlist junto a otras películas de aventuras a gran escala.`),

  S('movie:293660', `### De qué trata
Deadpool es una película de acción, aventuras y comedia de 2016 dirigida por Tim Miller. Basada en el antihéroe menos convencional de Marvel, narra el origen de un exagente de las fuerzas especiales llamado Wade Wilson, reconvertido en mercenario, que tras ser sometido a un cruel experimento para curar su cáncer adquiere poderes de curación rápida y adopta el alter ego de Deadpool.

Armado con sus nuevas habilidades y un oscuro y retorcido sentido del humor, Deadpool intentará dar caza al hombre que casi destruyó su vida.

### Cómo surgió
Los datos que tenemos recogen el año, 2016, y al director, Tim Miller. No describen cómo se desarrolló la película y esta página no inventa un historial. Las palabras clave (antihéroe, mercenario, superhéroe, adaptación de cómic y una escena tras los créditos) muestran cómo está clasificada y con qué juega.

### Detrás de las cámaras
El reparto principal lo forman Ryan Reynolds, Morena Baccarin, Ed Skrein y T.J. Miller. La sinopsis ya apunta a una mezcla de tonos: un origen de antihéroe contado con humor oscuro dentro de los géneros de acción, aventuras y comedia. Como las palabras clave señalan una escena tras los créditos, conviene quedarse hasta el final. Los detalles de producción no forman parte de nuestro registro y se omiten.

### Contexto y repercusión
Los espectadores le dan una nota media de 7,6 sobre 10. En Alemania tiene una clasificación de 16 años, lo que indica que va dirigida a un público adulto y no a las familias. Si buscas una película de superhéroes que se incline por la comedia y por un antihéroe, es una elección fácil para tu Watchlist.`),

  S('movie:299536', `### De qué trata
Vengadores: Infinity War es una película de aventuras, acción y ciencia ficción de 2018 dirigida por Joe Russo. El todopoderoso Thanos ha despertado con la promesa de arrasar con todo a su paso, portando el Guantelete del Infinito, que le confiere un poder incalculable.

Los únicos capaces de pararle los pies son los Vengadores y el resto de superhéroes de la galaxia, que deberán estar dispuestos a sacrificarlo todo por un bien mayor. El Capitán América e Iron Man deberán limar sus diferencias, Black Panther apoyará con sus tropas desde Wakanda, Thor y los Guardianes de la Galaxia e incluso Spider-Man se unirán antes de que los planes de devastación y ruina pongan fin al universo. ¿Serán capaces de frenar el avance del titán del caos?

### Cómo surgió
Nuestro registro contiene el año, 2018, y al director, Joe Russo. No documenta cómo se planificó o desarrolló la película, por lo que esta página no lo describe. Lo que la sinopsis deja claro es que la película se apoya en lo anterior: reúne en una sola historia a personajes que llegan desde distintos frentes.

### Detrás de las cámaras
El reparto principal lo forman Robert Downey Jr., Chris Evans, Chris Hemsworth y Josh Brolin. La sinopsis enfrenta a un gran grupo de héroes con un único oponente armado con el Guantelete del Infinito, lo que da al relato una estructura clara. La información sobre efectos, localizaciones o rodaje no figura en nuestros datos y no se supone.

### Contexto y repercusión
Los espectadores le dan una nota media de 8,2 sobre 10 y en Alemania está clasificada para mayores de 12 años. Como continúa películas anteriores sobre los mismos personajes, la disfrutarán sobre todo quienes ya conozcan al equipo. Si es tu caso, encaja de forma natural en una Watchlist junto a los demás títulos de superhéroes.`),

  S('movie:550', `### De qué trata
El club de la lucha (título original: Fight Club) es un drama y thriller de 1999 dirigido por David Fincher. Un hombre de treinta años se muestra insatisfecho con todo y por la noche ya no logra dormir. En busca de algún lugar donde descargar su ansiedad, empieza a frecuentar unos cursos en los que grupos de enfermos graves se reúnen y confiesan a los demás su situación.

Mientras se deja llevar por la emoción y el llanto ante lo que ve, conoce primero a Marla Singer y después a Tyler Durden. Ella es una joven también a la deriva, incapaz de elegir o decidir; él es un tipo decidido y vigoroso con una idea precisa en la cabeza. Tyler hace saltar por los aires el apartamento del hombre y los dos se van a vivir juntos a una casa ruinosa. Empeñado en implicarlo en su proyecto, Tyler lo introduce en un Fight Club, un gran sótano donde la gente se reúne para pegarse y así volver a sentirse viva.

### Cómo surgió
Los datos que tenemos recogen el año, 1999, y al director, David Fincher, pero no cuentan cómo se llegó a hacer la película. Esta página no añade un relato de origen que el registro no respalde. Los dos géneros, drama y thriller, sugieren lo que la sinopsis ya muestra: ante todo, una historia psicológica.

### Detrás de las cámaras
El reparto principal lo forman Edward Norton, Brad Pitt, Helena Bonham Carter y Meat Loaf. Los detalles de producción no constan en nuestro registro y se omiten.

### Contexto y repercusión
La nota media de los espectadores es de 8,4 sobre 10. En Alemania la película está clasificada para mayores de 18 años, de modo que va claramente dirigida a un público adulto. Encaja bien en una Watchlist si prefieres las historias oscuras centradas en los personajes a los espectáculos cargados de trama.`),

  S('movie:278', `### De qué trata
Cadena perpetua (título original: The Shawshank Redemption) es un drama de crimen de 1994 dirigido por Frank Darabont. En 1946, Andy Dufresne, un banquero joven y de éxito, ve cómo su vida cambia radicalmente al ser condenado por un crimen que nunca cometió: el homicidio de su esposa y del amante de ella.

Lo envían a una prisión que es la pesadilla de cualquier recluso, la Penitenciaría Estatal de Shawshank, en Maine, donde deberá cumplir cadena perpetua. Andy conoce enseguida al alcaide Norton, el corrupto y cruel funcionario de prisiones que usa la Biblia como arma de control, y al capitán Byron Hadley, que trata a los internos como animales. Andy entabla amistad con Ellis Boyd Redding, un preso que lleva veinte años cumpliendo condena y que controla el mercado negro de la institución.

### Cómo surgió
Nuestros datos recogen el año, 1994, y al director, Frank Darabont. No describen el desarrollo de la película, así que esta página tampoco lo hace. Sus dos géneros, drama y crimen, encajan con la sinopsis: una condena injusta y el mundo de una cárcel.

### Detrás de las cámaras
El reparto principal lo forman Tim Robbins, Morgan Freeman, Bob Gunton y William Sadler. La sinopsis construye la historia en torno a unas pocas relaciones dentro de la prisión: un nuevo recluso, una autoridad cruel y la amistad con un preso veterano. El resto de los detalles de producción no forman parte de nuestro registro y no se suponen.

### Contexto y repercusión
La nota media de los espectadores es de 8,7 sobre 10 y la película está clasificada para mayores de 12 años en Alemania. Si disfrutas de historias sobre la injusticia y la amistad contadas con calma, es una apuesta segura para tu Watchlist.`),

  S('movie:680', `### De qué trata
Pulp Fiction es una película de thriller, crimen y comedia de 1994 dirigida por Quentin Tarantino. Jules y Vincent, dos asesinos a sueldo con muy pocas luces, trabajan para Marsellus Wallace. Vincent le confiesa a Jules que Marsellus le ha pedido que cuide de Mia, su mujer.

Jules le recomienda prudencia, porque es muy peligroso sobrepasarse con la novia del jefe. Cuando llega la hora de trabajar, ambos deben ponerse manos a la obra. Su misión: recuperar un misterioso maletín.

### Cómo surgió
Los datos que tenemos de la película recogen el año, 1994, y al director, Quentin Tarantino. No contienen información sobre cómo se desarrolló el proyecto y esta página no la inventa. Los tres géneros indicados, thriller, crimen y comedia, ya describen la mezcla inusual con la que se la conoce: criminales que además resultan graciosos.

### Detrás de las cámaras
El reparto principal lo forman John Travolta, Samuel L. Jackson, Uma Thurman y Bruce Willis. La sinopsis se centra en dos personajes, Jules y Vincent, y en las personas para las que trabajan y a las que deben cuidar. Los detalles del rodaje, del guion o de la música no forman parte de nuestro registro y se omiten.

### Contexto y repercusión
Los espectadores le dan una nota media de 8,5 sobre 10. En Alemania está clasificada para mayores de 16 años. Es una elección natural para una Watchlist si te gustan las películas de crimen con sentido del humor, y una vez vista puedes compararla con otros títulos del mismo director.`),
];
