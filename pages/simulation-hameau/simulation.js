/* Simulation du Hameau de la Brume (T-0202, mise à jour par T-0206 avec D-306) : le moteur, sans affichage.
   Règle : .equipe/prototype/quetes-des-besoins.md (T-0201, T-0205). Tous les chiffres de la règle viennent de
   reglages.json (tableau du § 8) : ce fichier n'en contient aucun. Il sert à la page (window.SimHameau) et aux essais
   dans Node (module.exports). Même graine, mêmes réglages et mêmes gestes = même partie.
   Choix de la simulation (la règle ne les fixe pas ; rappelés dans la page, « Ce que la simulation simplifie ») :
   - pas d'une heure du monde ; les heures de jour et de l'emploi du temps sont arrondies à l'heure ;
   - les effets sur le travail (pluie, humeur, crise des outils) se multiplient ;
   - une demande ne s'ouvre que si son demandeur est debout (pas pendant ses heures à la maison) ;
   - la recharge de 24 h d'un besoin compte depuis la fermeture de sa demande précédente ;
   - à 80, le délai restant d'une demande pas encore acceptée passe à 6 h au plus ;
   - « sous la pluie » (réussite d'une tâche) = il pleut quand la tâche se termine ;
   - météo, bêtes, naissances et petits du troupeau, villageois et héros tirent leur hasard dans des suites séparées :
     avec la même graine, les comportements du héros ont la même météo, les mêmes loups et les mêmes naissances (tant
     qu'on ne force rien) ;
   T-0206 :
   - les demandes s'ouvrent toujours du besoin le plus haut au plus bas (la règle le dit pour le retour du héros), et
     jamais pour un besoin que la conscience a déjà en main (ordre en attente ou tâche), pas seulement au retour ;
   - absent, le héros simulé ne travaille pas à une demande qu'il a acceptée : elle attend son retour, et son délai
     pour accomplir court toujours ;
   - « part et revient » : la commande « le héros part / revient » de la page change aussi sa présence ; le cycle
     reprend à son heure suivante ;
   - les 65 habitants non suivis (adultes et enfants) sont comptés un par un, sans nom, sauf les successeurs désignés
     (prénom provisoire) ; une victime de perte de crise (B3, B5) est tirée parmi tous les adultes présents, suivis ou
     non ; un habitant non suivi blessé compte dans les soins (B6) comme un villageois ;
   - « un enfant tombe malade » : un enfant de 2 à 15 ans (pas un bébé) ;
   - un arrivant pour un rôle ordinaire, ou pour un PNJ nommé avec l'option « toujours un arrivant », vient 48 h après
     la mort ; le paysan qui change de rôle est le premier valide de la liste ; l'adulte non suivi qui prend un rôle est
     tiré au sort ;
   - option « la conscience choisit le plus apte » : l'aptitude n'est pas simulée, l'adulte est tiré au sort ;
   - naissances et petits du troupeau : un tirage par jour au lever du soleil ; une naissance annoncée un soir de
     silence (après une mort) l'est le soir suivant ;
   - anniversaires à minuit ; « forcer la mort du chef », « une mort au hasard » et « une naissance » sont des outils
     de la page, pas des règles.
   Choix de T-0202 repris dans la règle par T-0205 (lignes du § 8, « prop. ») : la conscience laisse au héros le besoin
   qu'il a accepté, même à 100 ; l'agente ne demande jamais ; à 0 bête, B2 est figé (ni crise, ni demande, ni garde).
   T-0227 (D-307 (1) à (4), expérience de D-312 (1) et D-315 (1)) :
   - l'expérience d'une demande réglée est donnée quand le héros la finit ; « en urgence » = acceptée à 80 ou plus ;
   - seule l'expérience des Besoins est comptée (pas les quêtes, ennemis, lieux…), à partir de l'expérience de départ
     du tableau ; le niveau du personnage suit la courbe A ; les métiers ne montrent que leurs points gagnés, sans
     niveau (leur valeur de départ dépend des quêtes, non simulées) ;
   - Minage et Forge n'existent dans la partie qu'une fois la quête du forgeron faite (D-209 (3)) ;
   - personne pour reprendre le rôle d'un PNJ nommé (toutes options) : l'arrivant vient 48 h après la mort, pas après
     la reprise manquée du lever suivant ; un seul arrivant attendu à la fois pour devenir successeur d'un rôle ;
   - un même temps tiré deux fois de suite (pluie, neige, couvert, clair) est annoncé comme prolongé, avec sa fin. */
(function (racine) {
  'use strict';

  function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function suite(graine) {   // mulberry32
    let a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  const METEO = { clair: 'temps clair', couvert: 'ciel couvert', pluie: 'pluie', neige: 'neige', tempete: 'Tempête de Neige' };
  const MODES = { rien: 'ne fait rien', tout: 'répond à tout', parfois: 'répond parfois', revient: 'part et revient' };

  function creerPartie(donnees, options) {
    // --- réglages -------------------------------------------------------------------------------------------------
    const R = {};
    for (const g of donnees.groupes) for (const l of g.lignes) R[l.id] = l.valeurs;
    const BES = donnees.besoins.map((b) => b.id);
    const INFO = Object.fromEntries(donnees.besoins.map((b) => [b.id, b]));
    const ROLES = donnees.roles, LIEUX = donnees.lieux, UI = donnees.interface, SUCC = donnees.successeurs;
    const o = Object.assign({
      graine: UI.graine_defaut, journees: UI.journees_defaut, heros: 'rien', modeSaison: R.mode_saison.defaut,
      agneau: R.quetes_apprentissage.agneau.defaut, forgeron: R.quetes_apprentissage.forgeron.defaut, etat: R.etat_depart.defaut,
      morts: R.morts_possibles.defaut, remede: R.remede.defaut, parJour: R.par_jour.defaut,
      presence: R.presence_depart.defaut, absentSeuil: R.absent_conscience.defaut, revientAccepte: R.heros_revient.defaut,
      pasEnvoyes: R.pas_envoyes.defaut, remplacementNomme: R.remplacement_nomme.defaut, agente: R.agente_morte.defaut,
      anParJours: R.croissance.defaut, vieillir: R.vieillir.defaut, enfants: R.enfants.defaut,
      mortLiee: R.mort_liee.defaut, absentMefiance: R.absent_mefiance.defaut,
      metiersPartie: R.metiers_partie.defaut, metierB4: R.metier_concerne.defaut, xpDepart: R.experience_depart.defaut,
    }, options || {});
    o.journees = Math.max(R.debut.journees_min, Math.min(R.debut.journees_max, Math.round(Number(o.journees) || UI.journees_defaut)));
    o.graine = Math.abs(Math.round(Number(o.graine))) || UI.graine_defaut;
    if (!MODES[o.heros]) o.heros = 'rien';
    // options lues dans une liste de nombres : une valeur hors de la liste reprend le défaut
    const nombreOpt = (v, l) => (l.options.includes(Number(v)) ? Number(v) : l.defaut);
    o.absentSeuil = nombreOpt(o.absentSeuil, R.absent_conscience);
    o.anParJours = nombreOpt(o.anParJours, R.croissance);
    o.xpDepart = nombreOpt(o.xpDepart, R.experience_depart);
    if (!R.metiers_partie.options.includes(o.metiersPartie)) o.metiersPartie = R.metiers_partie.defaut;
    if (!R.metier_concerne.options.includes(o.metierB4)) o.metierB4 = R.metier_concerne.defaut;
    const flux = (nom) => suite(fnv(o.graine + '/' + nom));
    const rnd = { meteo: flux('meteo'), betes: flux('betes'), village: flux('village'), heros: flux('heros'), force: flux('force'), vie: flux('vie') };
    const entre = (f, a, b) => a + Math.floor(f() * (b - a + 1));
    const tirer = (xs, f) => (xs.length ? xs[Math.floor(f() * xs.length)] : null);
    const P = R.paliers, HJ = R.par_jour.heures_par_jour, BMIN = R.besoins_depart.min, BMAX = R.besoins_depart.max;
    const borne = (v, a, b) => Math.max(a, Math.min(b, v));
    // travail de chaque rôle : les lignes « travail_j » du § 8 (b1 : chasseur, b2 : éleveur et berger…)
    const TRAVAIL = {};
    for (const id of BES) {
      const l = R[id.toLowerCase()];
      if (l && l.travail_j) for (const role in l.travail_j) TRAVAIL[role] = { besoin: id, j: l.travail_j[role] };
    }
    const AD = R.croissance.adulte_a, BB = R.croissance.bebe_avant, AN = o.anParJours * HJ;   // heures par an d'âge
    const NOMMES = R.remplacement_nomme.roles;
    // expérience (D-307 (4)) : courbe A (D-315 (1)) ; TOT[L] = points pour atteindre le niveau L depuis le niveau 1
    const CA = R.courbe_a, TOT = [0, 0];
    const coutNiveau = (n) => (n <= CA.carre_jusqu_au_niveau ? CA.a * n * n
      : CA.a * CA.carre_jusqu_au_niveau * CA.carre_jusqu_au_niveau + CA.pente * (n - CA.carre_jusqu_au_niveau));
    for (let L = 2; L <= CA.niveau_max; L++) TOT[L] = TOT[L - 1] + coutNiveau(L - 1);
    const niveauDe = (xp) => { let L = 1; while (L < CA.niveau_max && TOT[L + 1] <= xp) L++; return L; };
    // métiers de la partie (D-177 (4), D-209 (3)) et métier concerné par chaque besoin
    const METIERS = R.metiers_partie[o.metiersPartie].filter((m) => !(R.metiers_partie.apres_quete_forgeron.includes(m) && o.forgeron === 'pas-faite'));
    const metierDe = (b) => (b === R.metier_concerne.option_besoin ? o.metierB4 : R.metier_concerne.par_besoin[b]) || null;

    // --- saisons, glissement, heures ------------------------------------------------------------------------------
    const ORDRE = R.saisons.ordre;
    const suivante = (s) => ORDRE[(ORDRE.indexOf(s) + 1) % ORDRE.length];
    const PREMIER_JOUR = 1;   // premier jour d'une saison
    const part = (c) => (c.jour >= R.glissement.premier_jour
      ? (c.jour - R.calcul_glissement.jour_base) / R.calcul_glissement.longueur : 0);
    function glisse(c, f) {   // valeur = saison + (suivante − saison) × (jour − 20) / 10
      const a = f(c.saison, c.jour), k = part(c);
      if (!k) return a;
      const b = f(suivante(c.saison), PREMIER_JOUR);
      if (typeof a === 'number') return a + (b - a) * k;
      const r = {};
      for (const cle in a) r[cle] = a[cle] + (b[cle] - a[cle]) * k;
      return r;
    }
    const ligneMeteo = (s, j) => (s === 'Moisson'   // la ligne du § 8 qui donne les chances de la météo
      ? (j <= R.meteo_moisson_1_19.jusqu_au_jour ? 'meteo_moisson_1_19' : 'meteo_moisson_20')
      : s === 'Grand Gel' ? 'meteo_gel' : 'meteo_degel_brulure');
    const chancesBase = (s, j) => { const id = ligneMeteo(s, j); return id === 'meteo_degel_brulure' ? R[id][s] : R[id].chances; };
    function horaireBase(s) {
      const h = [R.horaire_degel_moisson, R.horaire_brulure, R.horaire_gel].find((x) => x.saisons.includes(s));
      return { lever: h.lever, t1d: h.travail[0][0], t1f: h.travail[0][1], t2d: h.travail[1][0], t2f: h.travail[1][1],
        aubD: h.auberge[0], aubF: h.auberge[1] };
    }
    const jourBase = (s) => ({ aube: R.heures_jour.minutes[s][0] / 60, crep: R.heures_jour.minutes[s][1] / 60 });
    const sais = (s) => R.b1_saison[s] || {};
    const b1Plus = (s) => sais(s).montee_j_en_plus || 0;
    const chasse = (s) => (sais(s).chasse_facteur === undefined ? 1 : sais(s).chasse_facteur);
    const paysanB1 = (s, j) => (s === 'Moisson' && j <= R.b1_saison.Moisson.jusqu_au_jour ? R.b1_saison.Moisson.paysan_j : 0);
    const b3Facteur = (s) => (R.b3_meteo_saison.facteur_montee[s] === undefined ? 1 : R.b3_meteo_saison.facteur_montee[s]);

    // --- état ---------------------------------------------------------------------------------------------------------
    const D = R.debut;
    const p = {
      t: 0, fin: o.journees * HJ - D.heure,
      cal: { saison: D.saison, jour: D.jour },
      calFige: { saison: R.mode_saison.figee_saison, jour: R.mode_saison.figee_jour },
      besoins: Object.assign({}, R.besoins_depart.depart),
      fige: { B2: o.agneau === 'pas-faite', B4: o.forgeron === 'pas-faite' },
      loup: o.agneau === 'faite-2',
      meteo: null, apresTempete: 0,
      villageois: donnees.villageois.map((v) => Object.assign({ titre: false }, v, { roleDepart: v.role, etat: 'valide', gueritA: null,
        remede: false, tache: null, lieu: 'maisons', activite: '', travaille: false, remplace: null, depuis: null })),
      autres: [], numHab: 0, numV: 0, nomsPris: new Set(),
      successeurs: {}, reprises: [], postes: [], arrivees: [], registre: [], apres: [], annonces: [],
      demandes: [], toutesDemandes: [], numDemande: 0, numTache: 0,
      dernierDemandeur: {}, derniereFermeture: {}, demandesDuJour: {},
      ordres: {}, taches: [], crise: {}, hausseB1: [], travailMoins: false,
      prix: { B1: false, B3: false, B4: false }, humeur: R.humeur.depart, etatHumeur: 'normal',
      etat: o.etat, etape: o.etat === 'amical' ? R.mefiance.etapes_pct.length - 1 : 0,
      services: 0, servicesApresAmical: 0, fautes: {}, mefianceAuRetour: [],
      heros: { mode: o.heros, present: o.presence !== 'parti', demande: null, reste: 0, compteur: { reglees: 0, urgence: 0 },
        or: 0, objets: {}, absence: null, resume: null, xp: o.xpDepart, xpBesoins: 0, metiers: {}, rienAuMetier: 0 },
      troupeau: R.troupeau.depart, sansBetes: false, silenceSoir: false, derniersRodeurs: null,
      journal: [], historique: [], finie: false,
      stats: { demandes: 0, regleesHeros: 0, personne: 0, acceptees: 0, echecsHeros: 0, taches: 0, reussites: 0, echecs: 0,
        blesses: 0, malades: 0, morts: 0, mortsSuivis: 0, mortsNommes: 0, mortsEnfants: 0, remplacements: 0, agents: 0,
        naissances: 0, arrivants: 0, plancher: 0, petits: 0, anniversaires: 0, devenusAdultes: 0, remontees: 0,
        departs: 0, retours: 0, heuresAbsent: 0, betesPerdues: 0, crises: 0, criseParBesoin: {}, max: {}, heuresUrgence: {},
        rumeurs: 0, tempetes: 0, meutes: 0, rodeurs: 0, humeurMin: R.humeur.depart, habitantsMin: 0, habitantsMax: 0,
        niveauxGagnes: 0, prolongations: 0 },
    };
    for (const b of BES) { p.stats.max[b] = p.besoins[b]; p.stats.heuresUrgence[b] = 0; p.stats.criseParBesoin[b] = 0; }

    // --- outils de temps et de texte ----------------------------------------------------------------------------------
    const heureDe = (t) => (D.heure + t) % HJ;
    const jourDe = (t) => Math.floor((D.heure + t) / HJ) + 1;
    const quand = (t) => (t >= p.fin ? `Fin du jour ${o.journees}` : `Jour ${jourDe(t)}, ${heureDe(t)} h`);
    const quandCourt = (t) => `jour ${jourDe(t)} à ${heureDe(t)} h`;
    const e = (v) => (v.genre === 'f' ? 'e' : '');
    const il = (v) => (v.genre === 'f' ? 'elle' : 'il');
    const nomRole = (v, r) => (v.genre === 'f' && ROLES[r || v.role].nom_f ? ROLES[r || v.role].nom_f : ROLES[r || v.role].nom);
    const qui = (v) => (v.titre ? v.nom : `${v.nom} (${nomRole(v)})`);
    const liste = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' et ' + xs[xs.length - 1]);
    const arr = (x) => Math.round(x);
    const nombre = (x) => String(x).replace('.', ',');   // écriture française d'un réglage (0,5)
    const mil = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');   // « 2 750 » (espace insécable)
    const points = (x) => `${mil(x)} point${x > 1 ? 's' : ''}`;
    const pl = (n, mot, mots) => `${n} ${n > 1 ? (mots || mot + 's') : mot}`;
    const Maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const voyelle = (s) => /^[aeéèêiîoôu]/i.test(s);
    const de = (s) => (voyelle(s) ? `d'${s}` : `de ${s}`);   // « le rôle d'éleveur », « le rôle de forgeron »
    const au = (s) => (voyelle(s) ? `à l'${s}` : `au ${s}`);   // « succéder à l'aubergiste », « au forgeron »
    // « de » devant un nom ou un groupe : « du forgeron », « de l'éleveur », « d'Aldric », « du manque de bois »
    const deNom = (s) => (/^le /.test(s) ? `du ${s.slice(3)}` : /^les /.test(s) ? `des ${s.slice(4)}` : voyelle(s) ? `d'${s}` : `de ${s}`);
    function noter(texte, type, important) { p.journal.push({ t: p.t, quand: quand(p.t), texte: Maj(texte), type, important: !!important }); }
    // ce qui suit une mort (remplaçant, méfiance, plancher…) s'écrit après la phrase qui annonce la mort
    function apres(texte, type, important) { p.apres.push([texte, type, important]); }
    function vider() { const a = p.apres.splice(0); for (const [t, ty, i] of a) noter(t, ty, i); }
    function calEffectif() { return o.modeSaison === 'figee' ? p.calFige : p.cal; }

    function contexte() {
      const c = calEffectif(), h = heureDe(p.t);
      const hb = glisse(c, (s) => horaireBase(s)), hor = {};
      for (const k in hb) hor[k] = Math.round(hb[k]);
      const jb = glisse(c, (s) => jourBase(s));
      const aube = Math.round(jb.aube), crep = Math.round(jb.crep);
      const type = p.meteo ? p.meteo.type : 'clair';
      return {
        c, h, hor, aube, crep, nuit: !(h >= aube && h < crep), chances: glisse(c, chancesBase),
        tempete: type === 'tempete', pluie: type === 'pluie', neige: type === 'neige',
        heuresTravail: (hor.t1f - hor.t1d) + (hor.t2f - hor.t2d),
        b1Plus: glisse(c, b1Plus), chasse: glisse(c, chasse), paysan: glisse(c, paysanB1), b3f: glisse(c, b3Facteur),
      };
    }

    function changer(b, d) {   // changement ponctuel d'un besoin (rien si figé) ; rend [avant, après]
      const av = p.besoins[b];
      if (p.fige[b]) return [av, av];
      p.besoins[b] = borne(av + d, BMIN, BMAX);
      p.stats.max[b] = Math.max(p.stats.max[b], p.besoins[b]);
      return [av, p.besoins[b]];
    }
    function humeur(d) { p.humeur = borne(p.humeur + d, R.humeur.min, R.humeur.max); }

    // --- habitants : villageois suivis (p.villageois) et habitants non suivis (p.autres) ------------------------------
    const vivant = (x) => x.etat !== 'mort';
    const valide = (x) => x.etat === 'valide';
    const estSuivi = (x) => p.villageois.includes(x);
    const parId = (id) => p.villageois.find((v) => v.id === id);
    const habitants = () => p.villageois.filter((v) => vivant(v) && v.role !== 'agente').length + p.autres.filter(vivant).length;
    const enfant = (u) => !estSuivi(u) && !u.adulte;
    function prochainNom(genre) {   // prénom provisoire suivant (du genre demandé s'il est donné)
      const n = donnees.noms.find((x) => !p.nomsPris.has(x.nom) && (!genre || x.genre === genre));
      if (!n) return { nom: `Habitant ${p.nomsPris.size + 1}`, genre: genre || 'm' };
      p.nomsPris.add(n.nom);
      return n;
    }
    const titreSucc = (x, r) => (x.genre === 'f' ? SUCC[r].titre_f : SUCC[r].titre);
    function nomDe(x) {   // nom à écrire dans le journal
      if (estSuivi(x)) return qui(x);
      if (x.nom) return x.successeurDe ? `${x.nom} (${titreSucc(x, x.successeurDe)})` : `${x.nom} (non suivi${e(x)})`;
      if (x.adulte) return x.genre === 'f' ? 'une habitante (non suivie)' : 'un habitant (non suivi)';
      if (x.age < BB) return `un bébé (${x.genre === 'f' ? 'une fille' : 'un garçon'})`;
      return `${x.genre === 'f' ? 'une enfant' : 'un enfant'} de ${x.age} ans`;
    }
    const court = (x) => (estSuivi(x) ? x.nom : nomDe(x));
    function nouvelHabitant(adulte, genre, age) {
      const u = { id: 'h' + (++p.numHab), adulte, genre, age: adulte ? null : age, prochainAnniv: null, etat: 'valide',
        gueritA: null, remede: false, malade: false, successeurDe: null, nom: null, ne: null };
      p.autres.push(u);
      return u;
    }
    function fait(cat, texte) { if (p.heros.absence) p.heros.absence.faits.push({ cat, texte }); }
    function registre(type, texte) { p.registre.push({ t: p.t, quand: quandCourt(p.t), type, texte }); }

    // --- météo ----------------------------------------------------------------------------------------------------------
    function sansGibier() {   // part de l'heure en cours sans gibier, après la tempête (vaut pour toute durée de retour)
      const h = R.retour_gibier.heures, deja = Math.ceil(h) - p.apresTempete;   // heures déjà passées depuis la fin
      return borne(h - deja, 0, 1);
    }
    function debutTempete() {
      p.stats.tempetes++;
      const b2 = changer('B2', R.b2_tempete_loup.tempete_debut), b5 = changer('B5', R.b5.tempete_debut);
      const effets = [];
      if (!p.fige.B2) effets.push(`bétail +${R.b2_tempete_loup.tempete_debut} (${arr(b2[1])})`);
      effets.push(`sécurité +${R.b5.tempete_debut} (${arr(b5[1])})`);
      noter(`Tempête de Neige (${p.meteo.reste} h) : tout le monde court à l'abri, maison ou auberge, enfants compris ; les tâches s'arrêtent ; ${effets.join(', ')}.`, 'meteo', true);
    }
    function tirerMeteo(x, forcee) {
      const avant = p.meteo ? p.meteo.type : null;
      let type = 'tempete';
      if (!forcee) {
        const ch = x.chances, total = Object.values(ch).reduce((a, b) => a + b, 0);
        let r = rnd.meteo() * total;
        type = Object.keys(ch).find((k) => (r -= ch[k]) < 0) || Object.keys(ch)[0];
      }
      const f = forcee ? rnd.force : rnd.meteo;
      p.meteo = { type, reste: entre(f, R.meteo_duree.min_h, R.meteo_duree.max_h), debut: p.t };
      if (avant === 'tempete' && type !== 'tempete') {
        p.apresTempete = Math.ceil(R.retour_gibier.heures);
        noter(`la tempête est finie (${METEO[type]}, ${p.meteo.reste} h) : chacun reprend son travail ; le gibier revient ${nombre(R.retour_gibier.heures)} h plus tard.`, 'meteo', true);
      } else if (type === 'tempete' && (avant !== 'tempete' || forcee)) debutTempete();
      else if (type === 'tempete') {   // deux tempêtes tirées à la suite : une seule tempête, prolongée (annoncée)
        noter(`la Tempête de Neige se prolonge de ${p.meteo.reste} h (jusqu'au ${quandCourt(p.t + p.meteo.reste)}) : tout le monde reste à l'abri.`, 'meteo', true);
      } else if (type !== avant && avant !== null) {
        const t = { clair: 'le ciel se dégage', couvert: 'le ciel se couvre', pluie: 'il se met à pleuvoir : on travaille plus lentement', neige: 'il neige : le froid monte' }[type];
        noter(`${t} (${p.meteo.reste} h).`, 'meteo', false);
      } else if (avant !== null) {   // même temps tiré deux fois de suite : il se prolonge (annoncé, avec sa fin)
        p.stats.prolongations++;
        const t = { clair: 'le temps reste clair', couvert: 'le ciel reste couvert', pluie: 'la pluie continue', neige: 'la neige continue' }[type];
        noter(`${t} ${p.meteo.reste} h de plus (jusqu'au ${quandCourt(p.t + p.meteo.reste)}).`, 'meteo', false);
      }
    }

    // --- villageois : où est chacun ---------------------------------------------------------------------------------------
    function activite(v, x) {
      if (v.etat === 'mort') return ['morts', `mort${e(v)} le ${quandCourt(v.mortA)}`, false];
      if (v.etat === 'blesse') return ['blesses', `blessé${e(v)}, au repos jusqu'au ${quandCourt(v.gueritA)}`, false];
      const H = x.hor, h = x.h, role = ROLES[v.role];
      let lieu, act, trav = false;
      if (v.role === 'aubergiste') {
        if (h >= R.aubergiste.debut && h < H.aubF) { lieu = 'auberge'; act = role.activite; }
        else if (h >= H.lever && h < H.aubF) { lieu = 'maisons'; act = `chez ${il(v)}`; } else { lieu = 'maisons'; act = 'dort'; }
      } else if (h >= H.lever && h < H.t1d) { lieu = 'maisons'; act = 'se lève'; }
      else if ((h >= H.t1d && h < H.t1f) || (h >= H.t2d && h < H.t2f)) { lieu = role.lieu; act = role.activite; trav = true; }
      else if (h >= H.t1f && h < H.t2d) { lieu = role.lieu; act = H.t2d - H.t1f > 1 ? 'pause à l\'ombre' : 'repas de midi'; }
      else if (h >= H.aubD && h < H.aubF) {
        if (p.etatHumeur === 'abattu' && R.humeur_seuils.abattu_soiree_maison) { lieu = 'maisons'; act = 'reste chez soi (hameau abattu)'; }
        else { lieu = 'auberge'; act = 'à l\'auberge'; }
      } else { lieu = 'maisons'; act = 'dort'; }
      if (v.tache) {
        const t = p.taches.find((y) => y.id === v.tache);
        if (t && t.active) return ['tache', `${INFO[t.besoin].tache} (fin vers le ${quandCourt(p.t + t.reste)})`, false];
        return [x.tempete && lieu === 'auberge' ? 'auberge' : 'maisons', `tâche en pause (${x.tempete ? 'tempête' : 'nuit'})`, false];
      }
      if (x.tempete) return [lieu === 'auberge' ? 'auberge' : 'maisons', 'à l\'abri (tempête)', false];
      return [lieu, act, trav];
    }
    function majActivites(x) {
      for (const t of p.taches) t.active = !x.nuit && !x.tempete;
      for (const v of p.villageois) [v.lieu, v.activite, v.travaille] = activite(v, x);
    }
    function quitterTache(x) {
      if (!x.tache) return;
      const t = p.taches.find((y) => y.id === x.tache);
      if (t) t.equipe = t.equipe.filter((i) => i !== x.id);
      x.tache = null;
    }
    function blesser(x, cause, malade) {   // blessé (ou enfant malade) : hors travail, soins qui montent
      if (typeof cause === 'function') cause = cause(x);
      x.etat = 'blesse'; x.malade = !!malade; x.gueritA = p.t + R.blessure.hors_travail_h; x.remede = false;
      quitterTache(x);
      if (malade) p.stats.malades++; else p.stats.blesses++;
      const d = malade ? R.b6.par_malade : R.b6.par_blesse, b6 = changer('B6', d);
      humeur(R.humeur_baisses.par_blesse);
      fait(malade ? 'malade' : 'blesse', court(x));
      return `${court(x)} ${cause} : ${malade ? `malade, au lit jusqu'au ${quandCourt(x.gueritA)}` : `blessé${e(x)}, hors travail jusqu'au ${quandCourt(x.gueritA)}`} (soins +${d} : ${arr(b6[1])})`;
    }

    // --- morts, remplaçants, successeurs, arrivants (D-306 (5), (6)) ------------------------------------------------------
    const adultesLibres = () => p.autres.filter((u) => u.adulte && vivant(u) && !u.successeurDe);
    function adulteLibre() {   // un adulte non suivi, tiré au sort (valide d'abord)
      const l = adultesLibres(), v = l.filter(valide);
      return tirer(v.length ? v : l, rnd.village);
    }
    const paysanLibre = () => p.villageois.filter((v) => v.role === 'paysan' && vivant(v) && !v.successeurDe).sort((a, z) => valide(z) - valide(a))[0] || null;
    function arrivantAdulte(sansNom) {   // un adulte arrive par la route (compté aussitôt parmi les habitants)
      const n = sansNom ? { nom: null, genre: rnd.village() < 0.5 ? 'f' : 'm' } : prochainNom(null);
      const u = nouvelHabitant(true, n.genre, null);
      u.nom = n.nom; u.arrivant = true;
      p.stats.arrivants++;
      fait('arrivant', u.nom || 'un arrivant');
      return u;
    }
    function designer(role) {   // § 6 « Successeur à désigner » : aussitôt
      const S = R.successeur_a_designer;
      // d : comment il a été choisi, accordé à son genre (« une adulte non suivie, tirée au sort »)
      let s = tirer(adultesLibres(), rnd.village), d = (x) => `un${e(x)} adulte non suivi${e(x)}, tiré${e(x)} au sort`;
      if (!s) { s = paysanLibre(); d = (x) => `un${e(x)} ${nomRole(x, 'paysan')}`; }
      if (!s) {
        if (role !== 'chef') {
          const deja = p.arrivees.find((a) => a.type === 'successeur' && a.role === role);   // un seul attendu à la fois
          if (deja) {
            apres(`personne ne peut être désigné pour succéder ${au(ROLES[role].nom)} : l'arrivant attendu le ${quandCourt(deja.t)} le sera.`, 'remplacement', false);
            return null;
          }
          p.arrivees.push({ t: p.t + S.arrivant_h, type: 'successeur', role });
          apres(`personne ne peut être désigné pour succéder ${au(ROLES[role].nom)} : un arrivant viendra dans ${S.arrivant_h} h.`, 'remplacement', false);
          return null;
        }
        s = arrivantAdulte(); d = (x) => `un${e(x)} arrivant${e(x)}, aussitôt (le rôle de chef n'attend jamais)`;
      }
      if (!s.nom) s.nom = prochainNom(s.genre).nom;
      s.successeurDe = role; p.successeurs[role] = s;
      apres(`${s.nom} (${d(s)}) devient ${titreSucc(s, role)} : ${il(s)} reprendra le rôle ${de(ROLES[role].nom)} s'il le faut.`, 'remplacement', false);
      return s;
    }
    function installer(s, role, mort, motif) {   // s (suivi ou non) prend le rôle ; la quête et les demandes du mort passent à s
      let etait;
      if (!estSuivi(s)) {
        etait = s.successeurDe ? titreSucc(s, s.successeurDe) : s.arrivant ? `arrivé${e(s)} par la route` : `habitant${e(s)} non suivi${e(s)}`;
        p.autres.splice(p.autres.indexOf(s), 1);
        Object.assign(s, { id: 'v' + (++p.numV), nom: s.nom || prochainNom(s.genre).nom, roleDepart: role, provisoire: true, titre: false,
          tache: null, lieu: 'maisons', activite: '', travaille: false, depuis: p.t, malade: false });
        p.villageois.push(s);
      } else {
        etait = s.successeurDe ? titreSucc(s, s.successeurDe) : nomRole(s);
        if (s.role === 'paysan') p.postes.push({ type: 'paysan', role: 'paysan', mort: { nom: s.nom, id: null, parti: true, motif: `à la place ${deNom(s.nom)}, devenu${e(s)} ${nomRole(s, role)}` }, depuis: p.t });
      }
      s.successeurDe = null;
      s.role = role; s.remplace = mort ? mort.nom : motif ? motif.replace(/^à la place (de |d'|du )/, (m, x) => (x === 'du ' ? 'le ' : '')) : null; s.depuis = p.t;
      p.stats.remplacements++;
      const rep = ROLES[role].reprise ? ` ; ${il(s)} ${ROLES[role].reprise} (même quête, répliques en variante : ${il(s)} dit qui ${il(s)} remplace)` : '';
      const txt = `${s.nom}, ${etait}, prend le rôle ${de(nomRole(s))}${mort ? ` laissé par ${mort.nom}` : motif ? ` (${motif})` : ''}${rep}`;
      apres(txt + '.', 'remplacement', true);
      registre('remplacement', txt);
      fait('remplacant', `${s.nom} devient ${nomRole(s)}${mort ? ` à la place ${deNom(mort.nom)}` : motif ? ` (${motif})` : ''}`);
      if (mort && mort.id) for (const d of p.demandes) if (d.demandeur === mort.id) {
        d.demandeur = s.id; d.nomDemandeur = qui(s);
        apres(`${s.nom} reprend aussi la demande d'aide ${deNom(mort.nom)} (${INFO[d.besoin].nom.toLowerCase()}) : délai inchangé (${quandCourt(d.delai)}).`, 'remplacement', true);
      }
    }
    function reprendre(role, mort, depuis) {   // PNJ nommé : son successeur (ou, selon l'option, le plus apte ou un arrivant) prend le rôle ; depuis : heure de la mort
      const opt = o.remplacementNomme;
      let s = null;
      if (opt === 'successeur') {
        s = p.successeurs[role];
        if (!s || !vivant(s)) { p.successeurs[role] = null; s = designer(role); }
      } else if (opt === 'plus-apte') s = adulteLibre() || paysanLibre();
      if (!s) {
        if (role === 'chef') s = arrivantAdulte();
        else {   // personne pour reprendre : un arrivant, compté depuis la mort (§ 8, « Arrivants adultes »), pas depuis ce lever
          const h = opt === 'successeur' ? R.successeur_a_designer.arrivant_h : R.arrivants.role_vide_h;
          const at = Math.max(p.t, (depuis === undefined ? p.t : depuis) + h);
          p.arrivees.push({ t: at, type: 'role', role, mort });
          apres(`le rôle ${de(ROLES[role].nom)} reste vide : un arrivant viendra le prendre le ${quandCourt(at)} (${h} h après la mort).`, 'remplacement', true);
          return;
        }
      }
      if (p.successeurs[role] === s) p.successeurs[role] = null;
      installer(s, role, mort);
      if (opt === 'successeur') designer(role);
    }
    function plancher() {   // § 6 « Plancher de 50 » : un arrivant compté au même instant
      while (habitants() < R.plancher.habitants) {
        arrivantAdulte(true);
        p.stats.plancher++;
        apres(`le hameau passerait sous ${R.plancher.habitants} habitants : un arrivant adulte (non suivi) est compté au même instant à la place du mort (en jeu, on le voit arriver par la route) ; habitants : ${habitants()}.`, 'vie', true);
      }
    }
    function tuer(x, cause) {   // cause : { besoin } (tâche ou perte de crise de ce besoin), ou null
      if (o.morts !== 'oui' || !vivant(x)) return false;
      const suivi = estSuivi(x), nom = nomDe(x);
      x.etat = 'mort'; x.gueritA = null; x.mortA = p.t;
      quitterTache(x);
      p.stats.morts++; p.silenceSoir = true;
      if (suivi) p.stats.mortsSuivis++;
      if (suivi && ROLES[x.role].nomme) p.stats.mortsNommes++;
      if (enfant(x)) p.stats.mortsEnfants++;
      humeur(R.humeur_baisses.par_mort);
      registre('mort', `${nom} meurt${cause && cause.besoin ? ` (${INFO[cause.besoin].nom.toLowerCase()})` : ''}`);
      fait('mort', nom);
      const mort = { nom: suivi ? qui(x) : nom, id: suivi ? x.id : null };
      if (x.successeurDe) {
        const r = x.successeurDe;
        x.successeurDe = null;
        if (p.successeurs[r] === x) { p.successeurs[r] = null; apres(`${x.nom} était ${titreSucc(x, r)} : un nouveau successeur est désigné aussitôt.`, 'remplacement', false); designer(r); }
      }
      if (suivi) {
        if (x.role === 'agente') {
          p.arrivees.push({ t: p.t + R.agente_morte.autre_agent_h, type: 'agent', role: 'agente', mort });
          apres(`le Cartel enverra un autre agent dans ${R.agente_morte.autre_agent_h} h.`, 'remplacement', true);
        } else if (NOMMES.includes(x.role)) {
          if (x.role === 'chef') reprendre('chef', mort);
          else if (o.remplacementNomme === 'arrivant') {   // option « toujours un arrivant » : 48 h comptées depuis la mort
            const h = R.arrivants.role_vide_h;
            p.arrivees.push({ t: p.t + h, type: 'role', role: x.role, mort });
            apres(`le rôle ${de(ROLES[x.role].nom)} reste vide : un arrivant viendra le prendre dans ${h} h (${quandCourt(p.t + h)}).`, 'remplacement', true);
          } else {
            p.reprises.push({ role: x.role, mort, depuis: p.t });
            const s = o.remplacementNomme === 'successeur' ? p.successeurs[x.role] : null;
            apres(`${s ? `${s.nom}, ${titreSucc(s, x.role)},` : 'un remplaçant'} prendra le rôle ${de(ROLES[x.role].nom)} au lever suivant.`, 'remplacement', true);
          }
        } else {
          const type = x.role === 'paysan' ? 'paysan' : 'ordinaire';
          p.postes.push({ type, role: x.role, mort, depuis: p.t });
        }
      }
      if (cause && cause.besoin) mortLiee(x, cause.besoin);
      plancher();
      return true;
    }
    function traiterPostes() {   // rôles ordinaires et paysans : repris en 24 h, sinon un arrivant
      for (const po of p.postes.slice()) {
        const paysan = po.type === 'paysan';
        if (p.t < po.depuis + (paysan ? R.paysans_completes.adulte_non_suivi_h : R.remplacement_ordinaire.delai_h)) continue;
        p.postes.splice(p.postes.indexOf(po), 1);
        if (paysan && p.villageois.filter((v) => v.role === 'paysan' && vivant(v)).length >= R.paysans_completes.jusqu_a) continue;
        const s = (paysan ? null : paysanLibre()) || adulteLibre();
        if (s) { installer(s, po.role, po.mort.parti ? null : po.mort, po.mort.motif); continue; }
        const at = Math.max(p.t, po.depuis + (paysan ? R.paysans_completes.arrivant_h : R.remplacement_ordinaire.arrivant_h));
        p.arrivees.push({ t: at, type: 'role', role: po.role, mort: po.mort.parti ? null : po.mort });
        apres(`personne ne peut reprendre le poste ${de(ROLES[po.role].nom)} : un arrivant viendra le prendre (${quandCourt(at)}).`, 'remplacement', true);
      }
    }
    function traiterArrivees() {
      for (const a of p.arrivees.filter((y) => y.t <= p.t)) {
        p.arrivees.splice(p.arrivees.indexOf(a), 1);
        if (a.type === 'agent') {
          const v = { id: 'v' + (++p.numV), nom: 'le nouvel agent du Cartel', role: 'agente', roleDepart: 'agente', genre: 'm', provisoire: false,
            titre: true, etat: 'valide', gueritA: null, remede: false, tache: null, lieu: 'auberge', activite: '', travaille: false, remplace: a.mort.nom, depuis: p.t };
          p.villageois.push(v);
          p.stats.agents++;
          const txt = `un autre agent du Cartel arrive au hameau à la place ${deNom(a.mort.nom)} : il ${ROLES.agente.reprise}`;
          apres(txt + ' (il n\'est pas compté parmi les habitants).', 'remplacement', true);
          registre('remplacement', txt);
          fait('remplacant', 'un autre agent du Cartel');
          continue;
        }
        const u = arrivantAdulte();
        if (a.type === 'successeur') {
          u.successeurDe = a.role; p.successeurs[a.role] = u;
          apres(`${u.nom}, arrivé${e(u)} par la route, devient ${titreSucc(u, a.role)}.`, 'remplacement', false);
          continue;
        }
        installer(u, a.role, a.mort, a.mort ? null : 'poste resté vide');
        if (NOMMES.includes(a.role) && o.remplacementNomme === 'successeur' && !p.successeurs[a.role]) designer(a.role);
      }
    }

    // --- cycle de vie : naissances, âges, petits du troupeau (D-306 (6)) ---------------------------------------------------
    function premierAnniv(age) {   // prochain anniversaire d'un enfant du départ (option « Moment où l'on vieillit »)
      if (o.vieillir === 'anniversaire') return entre(rnd.vie, 1, o.anParJours) * HJ - D.heure;   // jour tiré au hasard
      if (o.vieillir === 'zero') return AN - D.heure;
      return null;   // « saison » : tous au jour 1 de la saison
    }
    function naissance(genre, force) {
      const u = nouvelHabitant(false, genre, 0);
      u.ne = p.t;
      u.prochainAnniv = o.vieillir === 'saison' ? null : p.t + AN;
      p.stats.naissances++;
      humeur(R.humeur.par_naissance);
      p.annonces.push(genre === 'f' ? 'une fille' : 'un garçon');
      fait('naissance', genre === 'f' ? 'une fille' : 'un garçon');
      registre('naissance', `naissance d'${genre === 'f' ? 'une fille' : 'un garçon'}`);
      noter(`${force ? '(forcé) ' : ''}naissance d'${genre === 'f' ? 'une fille' : 'un garçon'} : le hameau compte ${habitants()} habitants (humeur +${R.humeur.par_naissance}).`, 'vie', true);
    }
    function vieillir(u) {
      u.age++;
      p.stats.anniversaires++;
      if (u.age >= AD) {
        u.adulte = true; p.stats.devenusAdultes++;
        noter(`${u.genre === 'f' ? 'une enfant' : 'un enfant'} du hameau a ${u.age} ans : ${il(u)} devient adulte (non suivi${e(u)}).`, 'vie', true);
      } else if (u.age === BB) noter(`un bébé a ${BB} ans : c'est maintenant ${u.genre === 'f' ? 'une enfant' : 'un enfant'}.`, 'vie', false);
      else noter(`${u.genre === 'f' ? 'une enfant' : 'un enfant'} du hameau a ${pl(u.age, 'an')}.`, 'vie', false);
    }
    function anniversaires() {
      for (const u of p.autres.slice()) if (enfant(u) && vivant(u) && u.prochainAnniv !== null && u.prochainAnniv <= p.t) { u.prochainAnniv += AN; vieillir(u); }
    }
    function vieillirSaison() {   // option « tous au jour 1 de chaque saison »
      if (o.vieillir !== 'saison') return;
      for (const u of p.autres.slice()) if (enfant(u) && vivant(u)) vieillir(u);
    }
    function lever() {   // au lever du soleil : un tirage de naissance, un tirage de petit (toujours faits : même suite)
      const r1 = rnd.vie(), r2 = rnd.vie(), r3 = rnd.vie();
      if (habitants() < R.naissances.si_moins_de && r1 < R.naissances.chance_pct / 100) naissance(r2 < 0.5 ? 'f' : 'm', false);
      const T = R.petits;
      if (p.troupeau >= T.min_betes && p.troupeau < T.max_betes && r3 < T.chance_pct / 100) {
        p.troupeau++; p.stats.petits++;
        fait('petit', '1');
        noter(`un petit est né dans le troupeau (agneau ou veau) : ${p.troupeau} bêtes.`, 'vie', false);
      }
    }

    // --- réputation : méfiance qui remonte (D-306 (4)) ---------------------------------------------------------------------
    const EP = R.mefiance.etapes_pct;
    const mefianceTexte = () => (p.etat === 'amical' ? '« Amical »' : R.etat_depart.sans_demande.includes(p.etat) ? p.etat : `+${EP[p.etape]} %`);
    function appliquerRemontee(pourquoi) {
      const M = R.mefiance_remonte, av = mefianceTexte();
      if (p.etat === 'amical') { p.etat = 'mefiant'; p.etape = EP.indexOf(M.depuis_amical_vers_pct); }
      else p.etape = Math.max(EP.indexOf(M.au_plus_pct), p.etape - M.etapes_par_mort);
      const ap = mefianceTexte();
      p.stats.remontees++;
      apres(av === ap ? `${pourquoi} : la méfiance est déjà au plus haut (${ap}) ; les villageois le lui reprochent.`
        : `la méfiance du hameau remonte d'une étape (${av} → ${ap}) : ${pourquoi}. Les villageois le reprochent au héros (c'est le « Deuil/Colère » de Repos § 3.A).`, 'mefiance', true);
    }
    function mortLiee(x, b) {   // § 5 : mort « à cause d'une demande acceptée »
      const f = p.fautes[b];
      if (!f || R.etat_depart.sans_demande.includes(p.etat)) return;
      if (o.mortLiee === 'une-par-demande' && f.morts >= 1) return;
      f.morts++;
      const pourquoi = `${court(x)} est mort${e(x)} ${deNom(INFO[b].le)}, alors que le héros avait accepté la demande ${deNom(f.demandeur)}`;
      if (!p.heros.present && o.absentMefiance === 'au-retour') {
        p.mefianceAuRetour.push(pourquoi);
        apres(`${pourquoi} : le héros est absent ; la méfiance remontera à son retour.`, 'mefiance', true);
      } else if (!p.heros.present && o.absentMefiance === 'jamais') apres(`${pourquoi} : le héros est absent ; cette mort ne compte pas contre lui (option).`, 'mefiance', true);
      else appliquerRemontee(pourquoi);
    }

    // --- présence du héros (D-306 (2)) ---------------------------------------------------------------------------------
    const C = R.heros_revient, CYCLE = C.present_h + C.absent_h, DECALAGE = o.presence === 'parti' ? C.present_h : 0;
    const phase = (t) => ((((D.heure + t - C.debut_heure + DECALAGE) % CYCLE) + CYCLE) % CYCLE);
    const prochainDepart = () => { const ph = phase(p.t); return p.t + (ph < C.present_h ? C.present_h - ph : CYCLE - ph + C.present_h); };
    const prochainRetour = () => { const ph = phase(p.t); return p.t + (ph === 0 ? CYCLE : CYCLE - ph); };
    function prochainChangement() {   // « part et revient » : heure du prochain départ (présent) ou du prochain retour (absent)
      if (p.heros.mode !== 'revient') return null;
      return p.heros.present ? prochainDepart() : prochainRetour();
    }
    function photo() {
      return { t: p.t, besoins: Object.assign({}, p.besoins), stats: JSON.parse(JSON.stringify(p.stats)), mef: mefianceTexte(),
        troupeau: p.troupeau, habitants: habitants(), faits: [] };
    }
    function partir(force) {
      const h = p.heros;
      if (!h.present) return;
      h.present = false; p.stats.departs++;
      h.absence = photo();
      const ouv = p.demandes.filter((d) => d.acceptee === null), acc = p.demandes.filter((d) => d.acceptee !== null);
      const pc = prochainChangement();
      noter(`${force ? '(commande) ' : ''}le héros quitte le hameau${pc !== null ? ` (il revient le ${quandCourt(pc)})` : ''}. Plus aucune demande ne s'ouvre ; la conscience prend les besoins dès ${o.absentSeuil}.${ouv.length ? ` Reste${ouv.length > 1 ? 'nt' : ''} ouverte${ouv.length > 1 ? 's' : ''}, délai inchangé : ${liste(ouv.map((d) => `${INFO[d.besoin].nom.toLowerCase()} (${d.nomDemandeur})`))}.` : ''}${acc.length ? ` La demande acceptée continue (${INFO[acc[0].besoin].nom.toLowerCase()}) : il doit l'avoir finie avant le ${quandCourt(acc[0].acceptee + R.delais.accomplir_h)} ; absent, il n'y travaille pas.` : ''}`, 'presence', true);
    }
    function resumeAbsence() {
      const A = p.heros.absence;
      if (!A) return null;
      const s = p.stats, d = (k) => s[k] - A.stats[k], mef = mefianceTexte();
      const ev = ['taches', 'blesses', 'malades', 'morts', 'remplacements', 'agents', 'naissances', 'arrivants', 'betesPerdues', 'petits', 'crises', 'devenusAdultes']
        .reduce((n, k) => n + d(k), 0) + (mef !== A.mef ? 1 : 0);
      if (!ev) return null;
      const parts = [];
      parts.push('besoins : ' + BES.filter((b) => !p.fige[b]).map((b) => `${INFO[b].nom.toLowerCase()} ${arr(A.besoins[b])} → ${arr(p.besoins[b])}`).join(', '));
      parts.push(d('taches') ? `la conscience a envoyé du monde ${d('taches')} fois (${d('reussites')} réussie${d('reussites') > 1 ? 's' : ''}, ${d('echecs')} échouée${d('echecs') > 1 ? 's' : ''})` : 'la conscience n\'a envoyé personne');
      if (d('crises')) parts.push(pl(d('crises'), 'crise'));
      if (d('blesses') || d('malades')) parts.push([d('blesses') ? pl(d('blesses'), 'blessé') : '', d('malades') ? pl(d('malades'), 'enfant malade', 'enfants malades') : ''].filter(Boolean).join(', '));
      const morts = A.faits.filter((f) => f.cat === 'mort').map((f) => f.texte), rem = A.faits.filter((f) => f.cat === 'remplacant').map((f) => f.texte);
      if (morts.length) parts.push(`${morts.length > 1 ? 'morts' : 'mort'} : ${liste(morts)} (tombes fraîches au bord du hameau)`);
      if (rem.length) parts.push(`${rem.length > 1 ? 'remplaçants' : 'remplaçant'} : ${liste(rem)}`);
      if (d('naissances')) parts.push(pl(d('naissances'), 'naissance'));
      if (d('arrivants')) parts.push(pl(d('arrivants'), 'arrivant'));
      if (d('devenusAdultes')) parts.push(pl(d('devenusAdultes'), 'enfant devenu adulte', 'enfants devenus adultes'));
      parts.push(`habitants : ${A.habitants} → ${habitants()}`);
      if (d('betesPerdues') || d('petits')) parts.push(`troupeau : ${A.troupeau} → ${p.troupeau} (${pl(d('betesPerdues'), 'bête perdue', 'bêtes perdues')}, ${pl(d('petits'), 'petit né', 'petits nés')})`);
      parts.push(mef === A.mef ? `méfiance inchangée (${mef})` : `méfiance : ${A.mef} → ${mef}`);
      return `(du ${quandCourt(A.t)} au ${quandCourt(p.t)}) : ${parts.join(' ; ')}.`;
    }
    function revenir(force) {
      const h = p.heros;
      if (h.present) return;
      h.present = true; p.stats.retours++;
      for (const m of p.mefianceAuRetour.splice(0)) appliquerRemontee(m + ' (pendant son absence)');
      const r = resumeAbsence();
      noter(`${force ? '(commande) ' : ''}le héros revient au hameau${r ? '' : ' : rien de notable pendant son absence'}.`, 'presence', true);
      if (r) { const txt = `Pendant votre absence ${r}`; noter(txt, 'retour', true); h.resume = { t: p.t, quand: quand(p.t), texte: txt }; }
      vider();
      h.absence = null;
    }
    function cycleHeros() {
      if (p.heros.mode !== 'revient') return;
      const ph = phase(p.t);
      if (ph === 0 && !p.heros.present) revenir(false);
      else if (ph === C.present_h && p.heros.present) partir(false);
    }

    // --- demandes ----------------------------------------------------------------------------------------------------
    function demandeurPossible(b) {
      const role = R.demandeur[b];
      let c;
      if (role === 'tirage') c = p.villageois.filter((v) => valide(v) && !R.demandeur.jamais.includes(v.role));
      else c = p.villageois.filter((v) => vivant(v) && v.role === role);
      if (c.length > 1 && R.changement_demandeur.pas_deux_fois_de_suite) c = c.filter((v) => v.id !== p.dernierDemandeur[b]);
      return c;
    }
    function raisonSansDemande(b) {   // pourquoi aucune demande ne peut s'ouvrir pour ce besoin (null = possible)
      if (R.etat_depart.sans_demande.includes(p.etat)) return 'hameau ' + (p.etat === 'hostile' ? 'hostile' : 'apeuré');
      if (!p.heros.present) return 'héros absent';
      if (p.demandes.some((d) => d.besoin === b)) return 'demande déjà ouverte';
      if (p.ordres[b] || p.taches.some((t) => t.besoin === b)) return 'la conscience l\'a déjà en main';
      if (p.demandes.length >= R.limites.ouvertes) return `déjà ${R.limites.ouvertes} demandes ouvertes`;
      if ((p.demandesDuJour[jourDe(p.t)] || 0) >= R.limites.par_jour) return `déjà ${R.limites.par_jour} demandes aujourd'hui`;
      if (p.derniereFermeture[b] !== undefined && p.t - p.derniereFermeture[b] < R.limites.recharge_h) return `moins de ${R.limites.recharge_h} h depuis la dernière demande`;
      if (!demandeurPossible(b).length) return 'personne pour demander';
      return null;
    }
    function ouvrirDemande(b, x, cand) {
      const v = cand[Math.floor(rnd.village() * cand.length)];
      const val = p.besoins[b], urg = val >= P.urgence;
      const d = { id: ++p.numDemande, besoin: b, demandeur: v.id, nomDemandeur: qui(v), ouverte: p.t,
        delai: p.t + (urg ? R.delais.repondre_urgence_h : R.delais.repondre_h), urgente: urg, acceptee: null,
        parfois: rnd.heros() < R.heros_parfois.accepte_pct / 100, quoi: R.quantites[b], valeur: val };
      p.demandes.push(d); p.toutesDemandes.push(d);
      p.dernierDemandeur[b] = v.id;
      p.demandesDuJour[jourDe(p.t)] = (p.demandesDuJour[jourDe(p.t)] || 0) + 1;
      p.stats.demandes++;
      noter(`${INFO[b].manque} (${arr(val)}) ; ${qui(v)} demande de l'aide au héros : ${d.quoi}${urg ? ' (urgent)' : ''}. Note au tableau ; réponse attendue avant le ${quandCourt(d.delai)}.`, 'demande', true);
    }
    function fermer(d, issue) {
      d.issue = issue; d.fermee = p.t;
      p.demandes = p.demandes.filter((y) => y !== d);
      p.derniereFermeture[d.besoin] = p.t;
    }
    function ouvrirFaute(d) { p.fautes[d.besoin] = { demande: d.id, demandeur: d.nomDemandeur, depuis: p.t, morts: 0 }; }
    function accepter(d) {
      const h = p.heros, b = d.besoin;
      d.acceptee = p.t; d.urgenteAcceptation = p.besoins[b] >= R.experience.urgence_a_partir_de;
      h.reste = R.heros_tout.duree_h[b]; h.demande = d.id;
      p.stats.acceptees++;
      if (o.mortLiee === 'des-acceptation') ouvrirFaute(d);
      noter(`le héros accepte d'aider ${d.nomDemandeur} : ${d.quoi}. Il pense avoir fini vers le ${quandCourt(p.t + h.reste)} (il a ${R.delais.accomplir_h} h au plus).`, 'heros', true);
    }
    function finirHeros() {
      const h = p.heros, d = p.demandes.find((y) => y.id === h.demande);
      h.demande = null; h.reste = 0;
      if (!d) return;
      const b = d.besoin, [av, ap] = changer(b, R.demande_reglee.baisse);
      h.compteur.reglees++;
      if (d.urgenteAcceptation) h.compteur.urgence++;
      h.or += R.or[b];
      const objet = R.objets_nature[b];
      if (objet) h.objets[objet] = (h.objets[objet] || 0) + 1;
      humeur(b === 'B6' ? R.humeur.b6_regle_par_le_heros : R.humeur.besoin_regle);
      const soins = [];
      if (b === 'B6') {
        for (const x of p.villageois.concat(p.autres)) if (x.etat === 'blesse') {
          x.remede = true;
          if (o.remede === 'aussitot') x.gueritA = p.t;
          else if (o.remede === 'apres-delai') x.gueritA = Math.min(x.gueritA, p.t + R.remede.reprise_apres_h);
          soins.push(court(x));
        }
      }
      p.services++; p.stats.regleesHeros++;
      let rep;
      if (p.etat === 'amical') { p.servicesApresAmical++; rep = 'le hameau est déjà « Amical » : le service est compté, sans effet (paliers au-delà à définir)'; }
      else if (p.etat === 'mefiant') {
        p.etape = Math.min(p.etape + R.etapes_par_demande.etapes, EP.length - 1);
        const n = R.etapes_par_demande.etapes;
        if (p.etape === EP.length - 1) { p.etat = 'amical'; rep = `la méfiance tombe à ${EP[EP.length - 1]} : le hameau devient « Amical » (prix ${String(R.amical.prix_pct).replace('-', '−')} %)`; }
        else rep = `la méfiance du hameau baisse ${n === 1 ? 'd\'une étape' : `de ${n} étapes`} (prix +${EP[p.etape]} %)`;
      } else rep = 'le hameau reste ' + p.etat;
      fermer(d, 'heros');
      // expérience (D-307 (4)) : personnage, plus le métier concerné s'il existe dans la partie
      const X = R.experience, urg = d.urgenteAcceptation, nivAvant = niveauDe(h.xp);
      const gain = urg ? X.personnage_urgence : X.personnage;
      h.xp += gain; h.xpBesoins += gain;
      const m = metierDe(b);
      let txtMetier = '';
      if (m && METIERS.includes(m)) {
        const gm = urg ? X.metier_urgence : X.metier;
        h.metiers[m] = (h.metiers[m] || 0) + gm;
        txtMetier = ` et ${donnees.metiers[m]} +${gm}`;
      } else if (m) { h.rienAuMetier++; txtMetier = `, rien au métier (pas de ${donnees.metiers[m]} dans cette partie)`; }
      const niv = niveauDe(h.xp);
      noter(`${INFO[b].heros_fait} : ${INFO[b].le} baisse de ${-R.demande_reglee.baisse} (${arr(av)} → ${arr(ap)}). Expérience${urg ? ' (demande acceptée en urgence)' : ''} : personnage +${gain} (${points(h.xp)}, niveau ${niv})${txtMetier}${objet ? ' ; ' + objet : ''}${R.or[b] ? ' et ' + pl(R.or[b], 'pièce') : ''} ; ${rep}.${soins.length ? ' Remède donné à ' + liste(soins) + '.' : ''}`, 'heros', true);
      if (niv > nivAvant) {
        p.stats.niveauxGagnes += niv - nivAvant;
        noter(`le héros passe ${niv - nivAvant > 1 ? `du niveau ${nivAvant} au niveau ${niv}` : `au niveau ${niv}`} (${points(h.xp)})${niv < CA.niveau_max ? ` ; le niveau ${niv + 1} demande ${mil(TOT[niv + 1])} points` : ''}.`, 'heros', true);
      }
    }

    // --- conscience collective -----------------------------------------------------------------------------------------
    function ordonner(b, raison) {
      if (p.fige[b] || p.ordres[b] || p.taches.some((t) => t.besoin === b)) return;
      // règle (choix de T-0202 repris au § 8) : le héros a accepté, on le laisse finir, même à 100
      if (p.demandes.some((d) => d.besoin === b && d.acceptee !== null)) return;
      p.ordres[b] = { raison, depuis: p.t, attente: false };
    }
    function nombreEnvoyes(val) {
      let n = 0;
      for (const [seuil, k] of R.envoyes.paliers) if (val >= seuil) n = k;
      return n;
    }
    function equipe(b, n) {
      const exclus = R.pas_envoyes.roles[o.pasEnvoyes] || R.pas_envoyes.roles[R.pas_envoyes.defaut];
      const derniers = o.pasEnvoyes === 'chef-aubergiste' ? R.pas_envoyes.apres_les_paysans : [];
      const duRole = (v) => ROLES[v.role].besoin === b && v.role !== 'paysan';
      const groupe = (v) => (duRole(v) ? 0 : v.role === 'paysan' ? 1 : 2);
      const propre = (v) => (ROLES[v.role].besoin ? p.besoins[ROLES[v.role].besoin] : BMAX);
      const c = p.villageois.filter((v) => valide(v) && !v.tache && !exclus.includes(v.role) && (duRole(v) || v.role === 'paysan' || derniers.includes(v.role)))
        .map((v) => ({ v, cle: rnd.village() }));
      c.sort((a, z) => groupe(a.v) - groupe(z.v) || propre(a.v) - propre(z.v) || a.cle - z.cle);
      return c.slice(0, n).map((a) => a.v);
    }
    function lancerOrdres(x) {
      const peut = !x.nuit && !x.tempete && x.h + R.envoyes.duree_h <= x.crep;
      const ordres = Object.keys(p.ordres).sort((a, z) => p.besoins[z] - p.besoins[a]);
      for (const b of ordres) {
        const ord = p.ordres[b], val = p.besoins[b], n = nombreEnvoyes(val);
        if (!n) { delete p.ordres[b]; noter(`${INFO[b].le} est retombé${INFO[b].accord} sous ${P.demande} (${arr(val)}) : la conscience n'envoie personne.`, 'conscience', false); continue; }
        if (!peut) {
          if (!ord.attente) { ord.attente = true; noter(`la conscience attendra ${x.tempete ? 'la fin de la tempête' : 'le jour'} pour ${INFO[b].tache} (nuit et tempête : chacun reste à l'abri, même en crise).`, 'conscience', false); }
          continue;
        }
        const eq = equipe(b, n);
        if (!eq.length) {
          if (ord.attente !== 'personne') { ord.attente = 'personne'; noter(`la conscience voudrait envoyer quelqu'un ${INFO[b].tache}, mais personne n'est libre.`, 'conscience', false); }
          continue;
        }
        const role = ROLES[eq[0].role].besoin === b && eq[0].role !== 'paysan';
        const base = (role ? R.reussite.role_pct : R.reussite.paysan_pct) + R.reussite.par_villageois_en_plus_pct * (eq.length - 1);
        const t = { id: ++p.numTache, besoin: b, equipe: eq.map((v) => v.id), noms: eq.map((v) => v.nom), reste: R.envoyes.duree_h,
          debut: p.t, base, active: true, raison: ord.raison };
        p.taches.push(t);
        for (const v of eq) v.tache = t.id;
        delete p.ordres[b];
        p.stats.taches++;
        noter(`la conscience envoie ${liste(eq.map(qui))} ${INFO[b].tache} pendant ${R.envoyes.duree_h} h (besoin à ${arr(val)} ; chance de réussite ${borne(base, R.reussite.min_pct, R.reussite.max_pct)} %, ${-R.pluie.reussite_pct} % de moins s'il pleut à la fin).`, 'conscience', true);
      }
    }
    function finirTache(t, x) {
      p.taches = p.taches.filter((y) => y !== t);
      const eq = t.equipe.map(parId).filter(Boolean);
      for (const v of eq) v.tache = null;
      const b = t.besoin;
      const chance = borne(t.base + (x.pluie ? R.pluie.reussite_pct : 0), R.reussite.min_pct, R.reussite.max_pct);
      if (!eq.length) { noter(`${INFO[b].tache_nom} s'arrête : plus personne dans l'équipe.`, 'conscience', false); return; }
      if (rnd.village() < chance / 100) {
        const [av, ap] = changer(b, R.baisse_tache.reussite);
        humeur(R.humeur.besoin_regle); p.stats.reussites++;
        noter(`${INFO[b].tache_nom} a réussi (${liste(eq.map((v) => v.nom))}) : ${INFO[b].le} baisse de ${-R.baisse_tache.reussite} (${arr(av)} → ${arr(ap)}).`, 'conscience', true);
      } else {
        const [av, ap] = changer(b, R.baisse_tache.echec);
        p.stats.echecs++;
        const sort = R.echec_sort.besoins_combat.includes(b) ? R.echec_sort.combat : R.echec_sort.travail;
        const suites = [];
        for (const v of eq) {
          const r = rnd.village();
          if (r < sort.mort_pct / 100 && o.morts === 'oui') { suites.push(`${Maj(v.nom)} ne revient pas : ${il(v)} est mort${e(v)}`); tuer(v, { besoin: b }); }
          else if (r < (sort.mort_pct + sort.blesse_pct) / 100) suites.push(Maj(blesser(v, 'revient blessé' + e(v)).replace(`${v.nom} revient blessé${e(v)} : `, `${v.nom} revient `)));
        }
        if (b === 'B2' && p.troupeau > 0) { const k = Math.min(p.troupeau, R.troupeau.perte_echec); p.troupeau -= k; p.stats.betesPerdues += k; suites.push(`${betes(k)} (troupeau : ${p.troupeau})${plusDeBetes()}`); }
        if (b === 'B4') { const o4 = changer('B4', R.b4.outil_perdu); suites.push(`un outil est perdu (outils +${R.b4.outil_perdu} : ${arr(o4[1])})`); }
        noter(`${INFO[b].tache_nom} a échoué : ${INFO[b].le} ne baisse que de ${-R.baisse_tache.echec} (${arr(av)} → ${arr(ap)})${suites.length ? '. ' + suites.join('. ') : ''}.`, 'conscience', true);
        vider();
      }
      if (p.besoins[b] >= P.urgence) ordonner(b, 'reste-haut');
    }

    // --- bêtes, crises, rumeurs ----------------------------------------------------------------------------------------
    const betes = (k) => `${k} bête${k > 1 ? 's' : ''} perdue${k > 1 ? 's' : ''}`;
    function plusDeBetes() {   // § 8 : « à 0 bête, B2 ne monte plus » ; figé (choix de T-0202 repris au § 8)
      if (p.troupeau > 0 || !R.troupeau.zero_bete_b2_fige || p.fige.B2) return '';
      p.fige.B2 = true; p.sansBetes = true;
      delete p.ordres.B2;
      const suites = [];
      for (const d of p.demandes.filter((y) => y.besoin === 'B2')) {
        fermer(d, 'sans-betes');
        if (p.heros.demande === d.id) { p.heros.demande = null; p.heros.reste = 0; }
        suites.push(`la demande ${deNom(d.nomDemandeur)} est retirée`);
      }
      for (const t of p.taches.filter((y) => y.besoin === 'B2')) {
        p.taches = p.taches.filter((y) => y !== t);
        for (const v of t.equipe.map(parId).filter(Boolean)) v.tache = null;
        suites.push(`${INFO.B2.tache_nom} s'arrête`);
      }
      return ` ; plus de bêtes : ${INFO.B2.le} ne bouge plus (ni crise, ni demande, ni garde)${suites.length ? ' ; ' + suites.join(' ; ') : ''}`;
    }
    function meute(f, quand) {
      const n = entre(f, R.meute.taille[0], R.meute.taille[1]);
      p.stats.meutes++;
      const ef = [];
      for (const b in R.meute.hausse) { const r = changer(b, R.meute.hausse[b]); if (!p.fige[b]) ef.push(`${INFO[b].nom.toLowerCase()} +${R.meute.hausse[b]} (${arr(r[1])})`); }
      noter(`${quand}une meute de ${n} loups rôde autour du hameau (${ef.join(', ')}).`, 'betes', true);
    }
    function coucher() {
      if (rnd.betes() < R.meute.chance_pct / 100) meute(rnd.betes, 'au coucher du soleil, ');
      if (rnd.betes() < R.rodeurs.chance_pct / 100) {
        const n = entre(rnd.betes, R.rodeurs.nombre[0], R.rodeurs.nombre[1]);
        p.derniersRodeurs = n; p.stats.rodeurs++;
        const r = changer('B5', R.rodeurs.hausse.B5);
        noter(`au coucher du soleil, ${n} morts-vivants rôdent près de la palissade (sécurité +${R.rodeurs.hausse.B5} : ${arr(r[1])}).`, 'betes', true);
      }
    }
    function victimes() {   // adultes présents non blessés, PNJ nommés et agente compris (§ 8, « Victime d'une perte de crise »)
      const c = p.villageois.filter((v) => valide(v) && !v.tache && !(v.role === 'agente' && o.agente === 'jamais-victime'))
        .concat(p.autres.filter((u) => u.adulte && valide(u)));
      if (o.enfants === 'comme-adultes') return c.concat(p.autres.filter((u) => enfant(u) && valide(u) && u.age >= BB));
      return c;
    }
    function perteCrise(b) {
      const pc = R.pertes_crise;
      let txt = '';
      if (b === 'B1') { p.hausseB1.push(p.t + pc.B1.apres_h); txt = `des réserves sont gâchées : ${INFO.B1.le} montera encore de ${pc.B1.hausse} dans ${pc.B1.apres_h} h`; }
      if (b === 'B2') { const k = Math.min(p.troupeau, pc.B2.betes); p.troupeau -= k; p.stats.betesPerdues += k; txt = `${betes(k)} (troupeau : ${p.troupeau})${plusDeBetes()}`; }
      if (b === 'B3' || b === 'B5') {
        const c = victimes();
        const ks = [];
        for (let i = 0; i < pc[b].blesses && c.length; i++) ks.push(blesser(c.splice(Math.floor(rnd.village() * c.length), 1)[0], b === 'B3' ? 'souffre du froid' : (w) => `est attaqué${e(w)} par des bêtes`));
        if (b === 'B3' && o.enfants !== 'jamais' && rnd.village() < pc.B3.enfant_malade_pct / 100) {
          const en = p.autres.filter((u) => enfant(u) && valide(u) && u.age >= BB);
          if (en.length) ks.push(blesser(tirer(en, rnd.village), 'tombe malade du froid', true));
        }
        txt = ks.length ? ks.join(' ; ') : 'personne de valide à blesser';
      }
      if (b === 'B4') { p.travailMoins = true; txt = `tout le monde travaille ${-pc.B4.travail_pct} % moins vite jusqu'au retour des outils sous ${pc.B4.jusqu_a_moins_de}`; }
      const morts = [];
      if (b === 'B6') {
        const ks = [];
        for (const x of p.villageois.concat(p.autres)) if (x.etat === 'blesse' && !(x.remede && R.remede.protege_de_la_mort_b6)) {
          if (rnd.village() < pc.B6.mort_pct / 100 && o.morts === 'oui') { ks.push(`${court(x)} meurt ${x.malade ? 'de sa maladie' : 'de ses blessures'}`); morts.push(x); }
        }
        txt = ks.length ? ks.join(' ; ') : 'les blessés tiennent bon';
      }
      p.stats.crises++; p.stats.criseParBesoin[b]++;
      noter(`CRISE : ${INFO[b].le} est à ${BMAX}. ${Maj(txt)}.`, 'crise', true);
      for (const x of morts) tuer(x, { besoin: b });
      vider();
    }
    function rumeur() {
      if (p.silenceSoir) { p.silenceSoir = false; noter('ce soir, l\'auberge se tait : le hameau pleure son mort.', 'rumeur', false); return; }
      if (p.annonces.length) { noter(`à l'auberge, on fête la naissance ${liste(p.annonces.splice(0).map((a) => (a === 'une fille' ? 'd\'une fille' : 'd\'un garçon')))}.`, 'rumeur', false); }
      if (p.humeur < R.rumeur.humeur_min) return;
      const bs = BES.filter((b) => !p.fige[b] && p.besoins[b] >= P.rumeur);
      if (!bs.length) return;
      p.stats.rumeurs++;
      noter(`à l'auberge, l'aubergiste parle de ce qui inquiète le hameau : ${liste(bs.map((b) => `${INFO[b].le} (${arr(p.besoins[b])})`))}.`, 'rumeur', false);
    }

    // --- une heure du monde ------------------------------------------------------------------------------------------
    function evenements(x) {
      // retours et échéances
      for (const tt of p.hausseB1.filter((y) => y <= p.t)) { const r = changer('B1', R.pertes_crise.B1.hausse); noter(`les réserves gâchées manquent : ${INFO.B1.le} monte de ${R.pertes_crise.B1.hausse} (${arr(r[1])}).`, 'crise', false); }
      p.hausseB1 = p.hausseB1.filter((y) => y > p.t);
      for (const v of p.villageois.concat(p.autres)) if (v.etat === 'blesse' && v.gueritA <= p.t) {
        v.etat = 'valide'; v.gueritA = null; v.remede = false;
        noter(`${court(v)} est guéri${e(v)}${v.malade ? ' de sa maladie' : ''}${estSuivi(v) && v.role !== 'agente' ? ' et reprend le travail' : ''}.`, 'blessure', false);
        v.malade = false;
      }
      // morts et remplaçants : arrivées, postes ordinaires (24 h), PNJ nommés (au lever suivant, 24 h au plus)
      traiterArrivees();
      traiterPostes();
      for (const r of p.reprises.slice()) if (x.h === x.hor.lever || p.t - r.depuis >= R.remplacement_nomme.au_plus_h) {
        p.reprises.splice(p.reprises.indexOf(r), 1);
        reprendre(r.role, r.mort, r.depuis);
      }
      vider();
      anniversaires();
      if (p.heros.demande !== null && p.heros.reste <= 0) finirHeros();
      cycleHeros();   // « part et revient » : départ ou retour (après la fin d'une demande finie juste avant de partir)
      for (const t of p.taches.filter((y) => y.reste <= 0)) finirTache(t, x);
      if (x.h === x.aube) lever();
      if (x.h === x.crep) coucher();
      if (x.h === x.hor.aubD) rumeur();
      // paliers : urgence, prix, crises, humeur
      for (const b of BES) {
        if (p.fige[b]) continue;
        const val = p.besoins[b];
        for (const d of p.demandes) if (d.besoin === b && d.acceptee === null && !d.urgente && val >= P.urgence) {
          d.urgente = true; d.delai = Math.min(d.delai, p.t + R.delais.repondre_urgence_h);
          noter(`${INFO[b].le} devient urgent${INFO[b].accord} (${arr(val)}) : ${d.nomDemandeur} attend une réponse avant le ${quandCourt(d.delai)}.`, 'demande', true);
        }
        if (b in p.prix) {
          if (!p.prix[b] && val >= R.prix.a_partir_de) { p.prix[b] = true; noter(`prix (${R.prix.biens[b]}) : +${R.prix.hausse_pct} % chez les marchands du hameau (besoin à ${arr(val)}).`, 'hameau', false); }
          else if (p.prix[b] && val < R.prix.retour_sous) { p.prix[b] = false; noter(`prix (${R.prix.biens[b]}) : retour à la normale.`, 'hameau', false); }
        }
        if (val >= BMAX) {
          const c = p.crise[b];
          if (!c) { p.crise[b] = { derniere: p.t }; perteCrise(b); ordonner(b, 'crise'); }
          else if (p.t - c.derniere >= R.pertes_crise.repetition_h) { c.derniere = p.t; perteCrise(b); ordonner(b, 'crise'); }
        } else p.crise[b] = null;
      }
      if (p.travailMoins && p.besoins.B4 < R.pertes_crise.B4.jusqu_a_moins_de) { p.travailMoins = false; noter('les outils vont mieux : chacun retrouve son rythme de travail.', 'hameau', false); }
      // délais passés
      for (const d of p.demandes.slice()) {
        if (d.acceptee === null && p.t >= d.delai) {
          fermer(d, 'personne'); p.stats.personne++;
          noter(`personne n'est venu aider ${d.nomDemandeur}. La conscience du hameau prend ${INFO[d.besoin].le} en main.`, 'conscience', true);
          ordonner(d.besoin, 'delai');
        } else if (d.acceptee !== null && p.t >= d.acceptee + R.delais.accomplir_h) {
          fermer(d, 'delai-file'); p.stats.echecsHeros++;
          if (p.heros.demande === d.id) { p.heros.demande = null; p.heros.reste = 0; }
          const qd = parId(d.demandeur);
          noter(`le héros n'a pas fini à temps${p.heros.present ? '' : ' (il est parti)'} : ${d.nomDemandeur} est déçu${qd ? e(qd) : ''} (réplique seulement ; la méfiance ne change pas, sauf si un villageois en meurt avant que ${INFO[d.besoin].le} repasse sous ${R.mort_liee.jusqu_au_retour_sous}).`, 'heros', true);
          if (o.mortLiee !== 'des-acceptation' || !p.fautes[d.besoin]) ouvrirFaute(d);
          ordonner(d.besoin, 'delai');
        }
      }
      // fin de la période où une mort compte contre le héros : besoin repassé sous 60 (et demande finie)
      for (const b of Object.keys(p.fautes)) if (p.besoins[b] < R.mort_liee.jusqu_au_retour_sous && !p.demandes.some((d) => d.besoin === b && d.acceptee !== null)) delete p.fautes[b];
      // nouvelles demandes (à 60, le besoin le plus haut d'abord), sinon la conscience prend le besoin dès 80 (60 en option, héros absent)
      for (const b of BES.slice().sort((a, z) => p.besoins[z] - p.besoins[a])) {
        if (p.fige[b]) continue;
        const val = p.besoins[b];
        if (val < P.demande) continue;
        const raison = raisonSansDemande(b);
        const seuil = raison === 'héros absent' ? o.absentSeuil : R.conscience_quand.sans_demande_possible_a;
        if (!raison) {
          const debout = demandeurPossible(b).filter((v) => x.h >= x.hor.lever && x.h < x.hor.aubF);
          if (debout.length) ouvrirDemande(b, x, debout);
        } else if (val >= seuil && !p.demandes.some((d) => d.besoin === b) && !p.ordres[b] && !p.taches.some((t) => t.besoin === b)) {
          ordonner(b, 'sans-demande');
          if (p.ordres[b]) noter(`${INFO[b].le} est à ${arr(val)} et aucune demande ne peut s'ouvrir (${raison}) : la conscience s'en charge.`, 'conscience', true);
        }
      }
      // le héros simulé (présent seulement)
      const h = p.heros;
      if (h.present && h.demande === null && h.mode !== 'rien') {
        const pc = h.mode === 'revient' && o.revientAccepte === 'finir-avant' ? prochainDepart() : null;
        const c = p.demandes.filter((d) => d.acceptee === null && p.t >= d.ouverte + R.heros_tout.accepte_apres_h && (h.mode !== 'parfois' || d.parfois)
          && (pc === null || p.t + R.heros_tout.duree_h[d.besoin] <= pc))
          .sort((a, z) => a.delai - z.delai);
        if (c.length) accepter(c[0]);
      }
      lancerOrdres(x);
      vider();
    }

    function debutHeure() {   // arrivée à l'heure p.t : calendrier, météo, présence du héros, événements, puis où est chacun
      if (p.t > 0 && heureDe(p.t) === 0) {   // minuit : jour suivant du calendrier
        const c = p.cal;
        c.jour++;
        if (c.jour > R.saisons.jours) {
          c.saison = suivante(c.saison); c.jour = PREMIER_JOUR;
          if (o.modeSaison !== 'figee') { noter(`début de la saison : ${c.saison}, jour ${PREMIER_JOUR}.`, 'saison', true); vieillirSaison(); }
        } else if (c.jour === R.glissement.premier_jour && o.modeSaison !== 'figee') noter(`${c.saison}, jour ${c.jour} : le temps, les besoins et les horaires glissent chaque jour vers ceux de la saison suivante (${suivante(c.saison)}).`, 'saison', true);
      }
      let x = contexte();
      if (!p.meteo || p.meteo.reste <= 0) { tirerMeteo(x, false); x = contexte(); }
      evenements(x);
      majActivites(x);
      enregistrer(x);
    }

    function heure() {   // l'heure p.t passe, puis la suivante commence
      if (p.finie) return false;
      const x = contexte();
      // l'heure qui passe : montées, travail, tâches, humeur
      const d = {};
      for (const b of BES) d[b] = 0;
      d.B1 += (R.b1.montee_j + x.b1Plus) / HJ;
      if (p.troupeau > 0) d.B2 += (x.nuit ? R.b2.montee_nuit_h : R.b2.montee_jour_h) * (p.loup ? R.b2_tempete_loup.loup_facteur : 1);
      d.B3 += R.b3.montee_j / HJ * x.b3f + (x.neige ? R.b3_meteo_saison.neige_h : 0) + (x.tempete ? R.b3_meteo_saison.tempete_h : 0);
      d.B4 += R.b4.montee_j / HJ;
      d.B5 += x.nuit ? R.b5.montee_nuit_h : R.b5.montee_jour_h;
      d.B6 += R.b6.repos_j / HJ;
      const ref = o.parJour === 'saison' ? x.heuresTravail : R.par_jour.heures_travail_reference;
      let f = 1;
      if (x.pluie) f *= 1 + R.pluie.travail_pct / 100;
      if (p.etatHumeur === 'abattu') f *= 1 + R.humeur_seuils.abattu_travail_pct / 100;
      if (p.etatHumeur === 'confiant') f *= 1 + R.humeur_seuils.confiant_travail_pct / 100;
      if (p.travailMoins) f *= 1 + R.pertes_crise.B4.travail_pct / 100;
      for (const v of p.villageois) {
        if (!v.travaille) continue;
        let tr = TRAVAIL[v.role];
        if (v.role === 'paysan') tr = { besoin: TRAVAIL.chasseur ? TRAVAIL.chasseur.besoin : 'B1', j: x.paysan };
        if (!tr || !tr.j) continue;
        let g = f;
        if (v.role === 'chasseur') { g *= x.chasse; if (p.apresTempete > 0) g *= 1 - sansGibier(); }
        d[tr.besoin] += tr.j / ref * g;
      }
      for (const b of BES) if (!p.fige[b]) { p.besoins[b] = borne(p.besoins[b] + d[b], BMIN, BMAX); p.stats.max[b] = Math.max(p.stats.max[b], p.besoins[b]); }
      for (const b of BES) if (!p.fige[b] && p.besoins[b] >= P.urgence) { humeur(R.humeur_baisses.par_besoin_urgent_j / HJ); p.stats.heuresUrgence[b]++; }
      for (const t of p.taches) if (t.active) t.reste--;
      if (p.heros.demande !== null && p.heros.present) p.heros.reste--;
      if (!p.heros.present) p.stats.heuresAbsent++;
      if (p.apresTempete > 0 && !x.tempete) p.apresTempete--;
      p.meteo.reste--;
      // humeur : abattu, normal, confiant
      const avant = p.etatHumeur, S = R.humeur_seuils;
      p.etatHumeur = p.humeur < S.abattu_sous ? 'abattu' : p.humeur > S.confiant_au_dessus ? 'confiant' : 'normal';
      p.stats.humeurMin = Math.min(p.stats.humeurMin, p.humeur);
      p.t++;
      if (avant !== p.etatHumeur) {
        noter(p.etatHumeur === 'abattu' ? `le hameau est abattu (humeur ${arr(p.humeur)}) : on travaille ${-S.abattu_travail_pct} % moins et on reste chez soi le soir.`
          : p.etatHumeur === 'confiant' ? `le hameau est confiant (humeur ${arr(p.humeur)}) : on travaille ${S.confiant_travail_pct} % mieux.`
            : `l'humeur du hameau redevient ordinaire (${arr(p.humeur)}).`, 'hameau', true);
      }
      if (p.t >= p.fin) {
        p.finie = true;
        const xf = contexte(); majActivites(xf); enregistrer(xf);
        noter(`partie terminée. ${resumeFin()}`, 'info', true);
      } else debutHeure();
      return !p.finie;
    }
    function enregistrer(x) {
      const last = p.historique[p.historique.length - 1];
      const hab = habitants();
      p.stats.habitantsMin = p.stats.habitantsMin ? Math.min(p.stats.habitantsMin, hab) : hab;
      p.stats.habitantsMax = Math.max(p.stats.habitantsMax, hab);
      const ligne = { t: p.t, b: BES.map((b) => Math.round(p.besoins[b] * 10) / 10), nuit: x.nuit, tempete: x.tempete, humeur: Math.round(p.humeur),
        hab, troupeau: p.troupeau, present: p.heros.present };
      if (last && last.t === p.t) p.historique[p.historique.length - 1] = ligne; else p.historique.push(ligne);
    }
    function resumeFin() {
      const s = p.stats;
      return `${pl(s.demandes, 'demande')} d'aide (${pl(s.regleesHeros, 'réglée')} par le héros, ${s.personne} sans réponse) ; ${pl(s.taches, 'tâche')} de la conscience (${pl(s.reussites, 'réussie')}, ${pl(s.echecs, 'échouée')}) ; ${pl(s.blesses, 'blessé')}, ${pl(s.malades, 'enfant malade', 'enfants malades')}, ${pl(s.morts, 'mort')} (${pl(s.mortsNommes, 'PNJ nommé', 'PNJ nommés')}), ${pl(s.remplacements, 'remplacement')} ; ${pl(s.naissances, 'naissance')}, ${pl(s.arrivants, 'arrivant')} ; ${pl(habitants(), 'habitant')} ; ${pl(s.betesPerdues, 'bête perdue', 'bêtes perdues')}, ${pl(s.petits, 'petit')} ; ${pl(s.crises, 'crise')} ; humeur ${arr(p.humeur)} ; méfiance ${mefianceTexte()}${s.remontees ? ` (remontée ${s.remontees} fois)` : ''} ; expérience du personnage ${points(p.heros.xp)}, niveau ${niveauDe(p.heros.xp)}${Object.keys(p.heros.metiers).length ? ` (${Object.entries(p.heros.metiers).map(([m, x]) => `${donnees.metiers[m]} +${x}`).join(', ')})` : ''}.`;
    }

    // --- départ ------------------------------------------------------------------------------------------------------
    {
      const K = R.composition;
      for (let i = 0; i < K.adultes_non_suivis; i++) nouvelHabitant(true, rnd.vie() < 0.5 ? 'f' : 'm', null);
      for (let i = 0; i < K.enfants; i++) {
        const age = entre(rnd.vie, K.age_enfants[0], K.age_enfants[1]);
        const u = nouvelHabitant(false, rnd.vie() < 0.5 ? 'f' : 'm', age);
        u.prochainAnniv = premierAnniv(age);
      }
      if (o.remplacementNomme === 'successeur') {   // les 4 successeurs désignés, parmi les adultes non suivis
        for (const r of NOMMES) {
          const u = adultesLibres().find((y) => y.genre === SUCC[r].genre) || adultesLibres()[0];
          u.successeurDe = r; u.nom = prochainNom(u.genre).nom; p.successeurs[r] = u;
        }
      }
      if (!p.heros.present) { p.heros.absence = photo(); p.stats.departs++; }
      const x = contexte();
      const fig = Object.keys(p.fige).filter((b) => p.fige[b]).map((b) => INFO[b].nom.toLowerCase());
      const succ = o.remplacementNomme === 'successeur' ? ` Successeurs désignés : ${liste(NOMMES.map((r) => `${p.successeurs[r].nom} (${titreSucc(p.successeurs[r], r)})`))}.` : '';
      noter(`début de la partie au Hameau de la Brume (${calEffectif().saison}, jour ${calEffectif().jour}${o.modeSaison === 'figee' ? ', saison figée' : ''}) pour ${o.journees} journée${o.journees > 1 ? 's' : ''}. Graine ${o.graine}. Héros : ${MODES[p.heros.mode]}, ${p.heros.present ? 'au hameau' : 'parti'}. Hameau ${{ mefiant: 'méfiant', amical: '« Amical »', hostile: 'hostile', apeure: 'apeuré' }[p.etat]} ; ${habitants()} habitants (${p.villageois.filter((v) => v.role !== 'agente').length} suivis, ${p.autres.filter((u) => u.adulte).length} adultes non suivis, ${p.autres.filter((u) => !u.adulte).length} enfants ; l'agente du Cartel n'est pas comptée).${succ}${fig.length ? ' Figé (quête d\'apprentissage pas encore faite) : ' + fig.join(', ') + '.' : ''}${p.loup ? ' Le loup garde le troupeau (issue 2 de « L\'Agneau et le Loup »).' : ''} Expérience du personnage : ${points(p.heros.xp)} (niveau ${niveauDe(p.heros.xp)}) ; métiers de la partie : ${METIERS.length ? liste(METIERS.map((m) => donnees.metiers[m])) : 'aucun'}.`, 'info', true);
      tirerMeteo(x, false);
      if (p.meteo.type !== 'clair' && p.meteo.type !== 'tempete') noter(`${METEO[p.meteo.type]} pour ${p.meteo.reste} h.`, 'meteo', false);
      debutHeure();
    }

    // --- ce que voit la page --------------------------------------------------------------------------------------------
    function vue() {
      const x = contexte(), c = calEffectif();
      const ad = p.autres.filter((u) => u.adulte && vivant(u)), en = p.autres.filter((u) => enfant(u) && vivant(u));
      const pc = prochainChangement();
      const attentes = p.postes.map((po) => ({ texte: `${ROLES[po.role].nom} : ${po.mort.parti ? `${po.mort.nom} a changé de rôle` : `laissé par ${po.mort.nom}`} ; repris le ${quandCourt(po.depuis + (po.type === 'paysan' ? R.paysans_completes.adulte_non_suivi_h : R.remplacement_ordinaire.delai_h))}` }))
        .concat(p.reprises.map((r) => ({ texte: `${ROLES[r.role].nom} : laissé par ${r.mort.nom} ; repris au lever suivant` })))
        .concat(p.arrivees.map((a) => ({ texte: `${a.type === 'agent' ? 'un autre agent du Cartel' : a.type === 'successeur' ? `un successeur pour le rôle ${de(ROLES[a.role].nom)}` : `un arrivant pour le poste ${de(ROLES[a.role].nom)}`}, attendu le ${quandCourt(a.t)}`, route: true })));
      return {
        t: p.t, fin: p.fin, finie: p.finie, quand: quand(p.t), jour: jourDe(p.t), heure: heureDe(p.t), journees: o.journees,
        saison: c.saison, jourSaison: c.jour, glissement: o.modeSaison !== 'figee' ? part(c) : 0, suivante: suivante(c.saison),
        figee: o.modeSaison === 'figee', nuit: x.nuit, aube: x.aube, crep: x.crep, horaire: x.hor,
        meteo: { type: p.meteo.type, nom: METEO[p.meteo.type], reste: p.meteo.reste,
          // lignes du § 8 qui donnent les chances : celle de la saison, et celle de la suivante pendant le glissement
          lignes: [...new Set([ligneMeteo(c.saison, c.jour)].concat(part(c) > 0 ? [ligneMeteo(suivante(c.saison), PREMIER_JOUR)] : []))] },
        besoins: BES.map((b) => ({ id: b, nom: INFO[b].nom, valeur: p.besoins[b], fige: !!p.fige[b], sansBetes: b === 'B2' && !!p.sansBetes, crise: !!p.crise[b],
          ordre: p.ordres[b] ? p.ordres[b].raison : null, tache: p.taches.some((t) => t.besoin === b), faute: !!p.fautes[b] })),
        demandes: p.demandes.map((d) => Object.assign({}, d, { delaiTexte: quandCourt(d.delai), ouverteTexte: quandCourt(d.ouverte), nomBesoin: INFO[d.besoin].nom,
          accompliTexte: d.acceptee !== null ? quandCourt(d.acceptee + R.delais.accomplir_h) : null })),
        taches: p.taches.map((t) => ({ besoin: t.besoin, nom: INFO[t.besoin].tache, noms: t.equipe.map((i) => parId(i).nom), reste: t.reste, active: t.active })),
        villageois: p.villageois.map((v) => ({ id: v.id, nom: v.nom, role: v.role, roleNom: nomRole(v), roleDepart: v.roleDepart,
          provisoire: v.provisoire, titre: !!v.titre, nomme: !!ROLES[v.role].nomme, etat: v.etat, lieu: v.lieu, activite: v.activite,
          remplace: v.remplace, depuis: v.depuis !== null && v.depuis !== undefined ? quandCourt(v.depuis) : null })),
        lieux: LIEUX,
        successeurs: NOMMES.map((r) => { const s = p.successeurs[r]; return { role: r, roleNom: ROLES[r].nom, nom: s ? s.nom : null, titre: s ? titreSucc(s, r) : null, etat: s ? s.etat : null, suivi: s ? estSuivi(s) : false }; }),
        attentes,
        population: { habitants: habitants(), suivis: p.villageois.filter((v) => vivant(v) && v.role !== 'agente').length, adultes: ad.length,
          enfants: en.filter((u) => u.age >= BB).length, bebes: en.filter((u) => u.age < BB).length,
          blesses: p.autres.filter((u) => u.etat === 'blesse' && !u.malade).length, malades: p.autres.filter((u) => u.etat === 'blesse' && u.malade).length,
          min: R.habitants.min, max: R.habitants.max, depart: R.habitants.depart, chef: (p.villageois.find((v) => v.role === 'chef' && vivant(v)) || {}).nom || null },
        registre: p.registre.slice(),
        heros: { mode: p.heros.mode, present: p.heros.present, occupe: p.heros.demande !== null, demande: p.heros.demande, reste: p.heros.reste,
          finTexte: p.heros.demande !== null ? (p.heros.present ? quandCourt(p.t + p.heros.reste) : 'à son retour') : null,
          prochain: pc !== null ? quandCourt(pc) : null, compteur: Object.assign({}, p.heros.compteur), or: p.heros.or, objets: Object.assign({}, p.heros.objets),
          resume: p.heros.resume, absentDepuis: p.heros.absence ? quandCourt(p.heros.absence.t) : null,
          experience: (() => {   // D-307 (4) ; courbe A (D-315 (1))
            const xp = p.heros.xp, niv = niveauDe(xp), max = niv >= CA.niveau_max;
            return { xp, depart: o.xpDepart, besoins: p.heros.xpBesoins, niveau: niv, niveauMax: CA.niveau_max, debutNiveau: TOT[niv],
              suivant: max ? null : TOT[niv + 1], part: max ? CA.bloque_pct / 100 : (xp - TOT[niv]) / (TOT[niv + 1] - TOT[niv]),
              niveauxGagnes: p.stats.niveauxGagnes, metiers: Object.assign({}, p.heros.metiers), rienAuMetier: p.heros.rienAuMetier,
              metiersPartie: METIERS.slice() };
          })() },
        hameau: { etat: p.etat, mefiance: p.etat === 'mefiant' || p.etat === 'amical' ? EP[p.etape] : null, mefianceTexte: mefianceTexte(),
          etape: p.etape, etapes: EP.length - 1, amicalPrix: R.amical.prix_pct, services: p.services, servicesApresAmical: p.servicesApresAmical,
          remontees: p.stats.remontees, auRetour: p.mefianceAuRetour.length, fautes: Object.keys(p.fautes).map((b) => ({ besoin: b, nom: INFO[b].nom, demandeur: p.fautes[b].demandeur })),
          humeur: p.humeur, etatHumeur: p.etatHumeur, troupeau: p.troupeau, troupeauDepart: R.troupeau.depart,
          habitants: habitants(), travailMoins: p.travailMoins },
        prix: Object.keys(p.prix).map((b) => ({ besoin: b, bien: R.prix.biens[b], hausse: p.prix[b] ? R.prix.hausse_pct : 0 })),
        stats: JSON.parse(JSON.stringify(p.stats)),
      };
    }
    function texteJournal() { return p.journal.map((j) => `${j.quand} : ${j.texte}`).join('\n'); }
    const apresGeste = () => { vider(); const x = contexte(); majActivites(x); enregistrer(x); };

    return {
      reglages: R, options: o, journal: p.journal, historique: p.historique, besoinsIds: BES, modes: MODES, totauxNiveaux: TOT.slice(),
      avancer: heure, vue, texteJournal, resumeFin,
      finie: () => p.finie,
      changerHeros(mode) { if (!MODES[mode]) return; p.heros.mode = mode; noter(`le comportement du héros change : ${MODES[mode]}.`, 'heros', false); },
      changerPresence() {   // commande « le héros est au hameau / est parti »
        if (p.finie) return 'partie finie';
        if (p.heros.present) partir(true); else revenir(true);
        apresGeste(); return null;
      },
      forcerTempete() {
        if (p.finie) return;
        tirerMeteo(contexte(), true); apresGeste();
      },
      forcerMeute() { if (p.finie) return; meute(rnd.force, '(forcé) '); apresGeste(); },
      forcerSaison() {
        if (p.finie) return;
        const c = calEffectif(), s = suivante(c.saison);
        c.saison = s; c.jour = PREMIER_JOUR;
        if (o.modeSaison === 'figee') { p.cal.saison = s; p.cal.jour = PREMIER_JOUR; }
        noter(`(forcé) changement de saison : ${s}, jour ${PREMIER_JOUR}, valeurs pleines, sans glissement.`, 'saison', true);
        vieillirSaison();
        apresGeste();
      },
      forcerNaissance() {
        if (p.finie) return 'partie finie';
        if (habitants() >= R.naissances.si_moins_de) return `déjà ${R.naissances.si_moins_de} habitants`;
        naissance(rnd.force() < 0.5 ? 'f' : 'm', true); apresGeste(); return null;
      },
      forcerMort(cible) {   // outil de la page : « la mort du chef » ou « une mort au hasard » (un adulte)
        if (p.finie) return 'partie finie';
        if (o.morts !== 'oui') return 'les morts sont désactivées (option)';
        // essais seulement : un identifiant de villageois suivi, ou « succ-<rôle> » (successeur désigné)
        const x = cible === 'chef' ? p.villageois.find((v) => v.role === 'chef' && vivant(v))
          : cible === 'hasard' ? tirer(p.villageois.filter((v) => vivant(v) && v.role !== 'agente').concat(p.autres.filter((u) => u.adulte && vivant(u))), rnd.force)
            : String(cible).startsWith('succ-') ? p.successeurs[String(cible).slice(5)]
              : p.villageois.find((v) => v.id === cible && vivant(v));
        if (!x) return 'personne';
        noter(`(forcé) ${nomDe(x)} meurt.`, 'mort', true);
        tuer(x, null); apresGeste(); return null;
      },
      repondre(id) {   // le joueur répond lui-même : le héros accepte la demande
        if (p.finie) return 'partie finie';
        if (!p.heros.present) return 'le héros est parti';
        const d = p.demandes.find((y) => y.id === id);
        if (!d) return 'demande fermée';
        if (d.acceptee !== null) return 'déjà acceptée';
        if (p.heros.demande !== null) return 'le héros est déjà occupé';
        accepter(d); apresGeste(); return null;
      },
    };
  }

  const api = { creerPartie, modes: MODES };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.SimHameau = api;
})(typeof self !== 'undefined' ? self : this);
