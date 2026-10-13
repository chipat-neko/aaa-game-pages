/* Simulation du Hameau de la Brume (T-0202, D-305) : le moteur, sans affichage.
   Règle : .equipe/prototype/quetes-des-besoins.md (T-0201). Tous les chiffres de la règle viennent de reglages.json
   (tableau du § 8) : ce fichier n'en contient aucun. Il sert à la page (window.SimHameau) et aux essais dans Node
   (module.exports). Même graine, mêmes réglages et mêmes gestes = même partie.
   Choix de la simulation (la règle ne les fixe pas ; rappelés dans la page, « Limites ») :
   - pas d'une heure du monde ; les heures de jour et de l'emploi du temps sont arrondies à l'heure ;
   - les effets sur le travail (pluie, humeur, crise des outils) se multiplient ;
   - une demande ne s'ouvre que si son demandeur est debout (pas pendant ses heures à la maison) ;
   - la recharge de 24 h d'un besoin compte depuis la fermeture de sa demande précédente ;
   - à 80, le délai restant d'une demande pas encore acceptée passe à 6 h au plus ;
   - « sous la pluie » (réussite d'une tâche) = il pleut quand la tâche se termine ;
   - météo, bêtes, villageois et héros tirent leur hasard dans des suites séparées : avec la même graine, deux
     comportements du héros ont la même météo et les mêmes loups (tant qu'on ne force rien) ;
   - (correction 1) quand le héros a accepté la demande d'un besoin, la conscience ne prend pas ce besoin, même à 100
     (la règle ne prévoit pas d'exception) : on laisse le héros finir ; les pertes de crise ont lieu quand même ;
   - (correction 1) l'agente du Cartel n'est jamais tirée au sort pour demander de l'aide pour les soins (B6) : elle
     n'est pas une habitante (§ 4) ; le § 8 n'exclut que le chef ;
   - (correction 1) à 0 bête, le bétail (B2) est figé, comme le transcrit reglages.json (zero_bete_b2_fige) : il ne
     monte plus (ni la nuit, ni la tempête, ni la meute), aucune crise, aucune demande, aucune garde ; la demande ou la
     garde en cours s'arrête. La règle dit seulement « ne monte plus ». */
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

  function creerPartie(donnees, options) {
    // --- réglages -------------------------------------------------------------------------------------------------
    const R = {};
    for (const g of donnees.groupes) for (const l of g.lignes) R[l.id] = l.valeurs;
    const BES = donnees.besoins.map((b) => b.id);
    const INFO = Object.fromEntries(donnees.besoins.map((b) => [b.id, b]));
    const ROLES = donnees.roles, LIEUX = donnees.lieux, UI = donnees.interface;
    const o = Object.assign({
      graine: UI.graine_defaut, journees: UI.journees_defaut, heros: 'rien', modeSaison: R.mode_saison.defaut,
      agneau: R.quetes_ecrites.agneau.defaut, forgeron: R.quetes_ecrites.forgeron.defaut, etat: R.etat_depart.defaut,
      morts: R.morts_possibles.defaut, remede: R.remede.defaut, parJour: R.par_jour.defaut,
    }, options || {});
    o.journees = Math.max(R.debut.journees_min, Math.min(R.debut.journees_max, Math.round(Number(o.journees) || UI.journees_defaut)));
    o.graine = Math.abs(Math.round(Number(o.graine))) || UI.graine_defaut;
    const flux = (nom) => suite(fnv(o.graine + '/' + nom));
    const rnd = { meteo: flux('meteo'), betes: flux('betes'), village: flux('village'), heros: flux('heros'), force: flux('force') };
    const entre = (f, a, b) => a + Math.floor(f() * (b - a + 1));
    const P = R.paliers, HJ = R.par_jour.heures_par_jour, BMIN = R.besoins_depart.min, BMAX = R.besoins_depart.max;
    const borne = (v, a, b) => Math.max(a, Math.min(b, v));
    // travail de chaque rôle : les lignes « travail_j » du § 8 (b1 : chasseur, b2 : éleveur et berger…)
    const TRAVAIL = {};
    for (const id of BES) {
      const l = R[id.toLowerCase()];
      if (l && l.travail_j) for (const role in l.travail_j) TRAVAIL[role] = { besoin: id, j: l.travail_j[role] };
    }

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
      villageois: donnees.villageois.map((v) => Object.assign({}, v, { roleDepart: v.role, etat: 'valide', gueritA: null,
        remede: false, tache: null, lieu: 'maisons', activite: '', travaille: false })),
      demandes: [], toutesDemandes: [], numDemande: 0, numTache: 0,
      dernierDemandeur: {}, derniereFermeture: {}, demandesDuJour: {},
      ordres: {}, taches: [], crise: {}, hausseB1: [], travailMoins: false,
      prix: { B1: false, B3: false, B4: false }, humeur: R.humeur.depart, etatHumeur: 'normal',
      etat: o.etat, etape: o.etat === 'amical' ? R.mefiance.etapes_pct.length - 1 : 0,
      services: 0, servicesApresAmical: 0,
      heros: { mode: o.heros, finA: null, demande: null, xp: {}, or: 0, objets: {} },
      troupeau: R.troupeau.depart, sansBetes: false, silenceSoir: false, remplacements: [], derniersRodeurs: null,
      journal: [], historique: [], finie: false,
      stats: { demandes: 0, regleesHeros: 0, personne: 0, taches: 0, reussites: 0, echecs: 0, blesses: 0, morts: 0,
        betesPerdues: 0, crises: 0, criseParBesoin: {}, max: {}, heuresUrgence: {}, rumeurs: 0, tempetes: 0, meutes: 0,
        rodeurs: 0, humeurMin: R.humeur.depart },
    };
    for (const b of BES) { p.stats.max[b] = p.besoins[b]; p.stats.heuresUrgence[b] = 0; p.stats.criseParBesoin[b] = 0; }
    if (p.etat === 'amical') p.services = 0;

    // --- outils de temps et de texte ----------------------------------------------------------------------------------
    const heureDe = (t) => (D.heure + t) % HJ;
    const jourDe = (t) => Math.floor((D.heure + t) / HJ) + 1;
    const quand = (t) => (t >= p.fin ? `Fin du jour ${o.journees}` : `Jour ${jourDe(t)}, ${heureDe(t)} h`);
    const quandCourt = (t) => `jour ${jourDe(t)} à ${heureDe(t)} h`;
    const e = (v) => (v.genre === 'f' ? 'e' : '');
    const nomRole = (v, r) => (v.genre === 'f' && ROLES[r || v.role].nom_f ? ROLES[r || v.role].nom_f : ROLES[r || v.role].nom);
    const qui = (v) => (ROLES[v.roleDepart].nomme ? v.nom : `${v.nom} (${nomRole(v)})`);
    const liste = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' et ' + xs[xs.length - 1]);
    const arr = (x) => Math.round(x);
    const nombre = (x) => String(x).replace('.', ',');   // écriture française d'un réglage (0,5)
    const Maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    function noter(texte, type, important) { p.journal.push({ t: p.t, quand: quand(p.t), texte: Maj(texte), type, important: !!important }); }
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
      noter(`Tempête de Neige (${p.meteo.reste} h) : tout le monde court à l'abri, maison ou auberge ; les tâches s'arrêtent ; ${effets.join(', ')}.`, 'meteo', true);
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
        noter(`la tempête est finie (${METEO[type]}) : chacun reprend son travail ; le gibier revient ${nombre(R.retour_gibier.heures)} h plus tard.`, 'meteo', true);
      } else if (type === 'tempete' && (avant !== 'tempete' || forcee)) debutTempete();
      else if (type !== avant && avant !== null) {
        const t = { clair: 'le ciel se dégage', couvert: 'le ciel se couvre', pluie: 'il se met à pleuvoir : on travaille plus lentement', neige: 'il neige : le froid monte' }[type];
        noter(`${t} (${p.meteo.reste} h).`, 'meteo', false);
      }
    }

    // --- villageois -----------------------------------------------------------------------------------------------------
    const vivant = (v) => v.etat !== 'mort';
    const valide = (v) => v.etat === 'valide';
    const parId = (id) => p.villageois.find((v) => v.id === id);
    function activite(v, x) {
      if (v.etat === 'mort') return ['morts', `mort${e(v)}`, false];
      if (v.etat === 'blesse') return ['blesses', `blessé${e(v)}, au repos jusqu'au ${quandCourt(v.gueritA)}`, false];
      const H = x.hor, h = x.h, role = ROLES[v.role];
      let lieu, act, trav = false;
      if (v.role === 'aubergiste') {
        if (h >= R.aubergiste.debut && h < H.aubF) { lieu = 'auberge'; act = role.activite; }
        else if (h >= H.lever && h < H.aubF) { lieu = 'maisons'; act = 'chez elle'; } else { lieu = 'maisons'; act = 'dort'; }
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
    function blesser(v, cause) {
      if (typeof cause === 'function') cause = cause(v);
      v.etat = 'blesse'; v.gueritA = p.t + R.blessure.hors_travail_h; v.remede = false;
      if (v.tache) { const t = p.taches.find((y) => y.id === v.tache); if (t) t.equipe = t.equipe.filter((i) => i !== v.id); v.tache = null; }
      p.stats.blesses++;
      const b6 = changer('B6', R.b6.par_blesse);
      humeur(R.humeur_baisses.par_blesse);
      return `${v.nom} ${cause} : blessé${e(v)}, hors travail jusqu'au ${quandCourt(v.gueritA)} (soins +${R.b6.par_blesse} : ${arr(b6[1])})`;
    }
    function tuer(v) {
      v.etat = 'mort'; v.gueritA = null;
      if (v.tache) { const t = p.taches.find((y) => y.id === v.tache); if (t) t.equipe = t.equipe.filter((i) => i !== v.id); v.tache = null; }
      p.stats.morts++; p.silenceSoir = true;
      humeur(R.humeur_baisses.par_mort);
      if (v.role !== 'paysan') p.remplacements.push({ t: p.t + R.blessure.remplacement_h, role: v.role, mort: v.nom });
    }
    const eligiblesPertes = () => p.villageois.filter((v) => valide(v) && !v.tache && !ROLES[v.role].nomme);

    // --- demandes ----------------------------------------------------------------------------------------------------
    function demandeurPossible(b) {
      const role = R.demandeur[b];
      let c;
      // choix de la simulation (signalé dans la page) : l'agente du Cartel n'est pas tirée au sort, elle n'est pas une habitante
      if (role === 'tirage') c = p.villageois.filter((v) => valide(v) && !R.demandeur.jamais.includes(v.role) && v.role !== 'agente');
      else c = p.villageois.filter((v) => vivant(v) && v.role === role);
      if (c.length > 1 && R.changement_demandeur.pas_deux_fois_de_suite) c = c.filter((v) => v.id !== p.dernierDemandeur[b]);
      return c;
    }
    function raisonSansDemande(b) {   // pourquoi aucune demande ne peut s'ouvrir pour ce besoin (null = possible)
      if (R.etat_depart.sans_demande.includes(p.etat)) return 'hameau ' + (p.etat === 'hostile' ? 'hostile' : 'apeuré');
      if (p.demandes.some((d) => d.besoin === b)) return 'demande déjà ouverte';
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
    function accepter(d) {
      const h = p.heros, b = d.besoin;
      d.acceptee = p.t; d.urgenteAcceptation = p.besoins[b] >= R.experience.urgence_a_partir_de;
      h.finA = p.t + R.heros_tout.duree_h[b]; h.demande = d.id;
      noter(`le héros accepte d'aider ${d.nomDemandeur} : ${d.quoi}. Il pense avoir fini vers le ${quandCourt(h.finA)} (il a ${R.delais.accomplir_h} h au plus).`, 'heros', true);
    }
    function finirHeros() {
      const h = p.heros, d = p.demandes.find((y) => y.id === h.demande);
      h.finA = null; h.demande = null;
      if (!d) return;
      const b = d.besoin, [av, ap] = changer(b, R.demande_reglee.baisse);
      const pts = d.urgenteAcceptation ? R.experience.points_urgence : R.experience.points;
      const metier = R.experience.metier[b] || 'attente';
      h.xp[metier] = (h.xp[metier] || 0) + pts;
      h.or += R.or[b];
      const objet = R.objets_nature[b];
      if (objet) h.objets[objet] = (h.objets[objet] || 0) + 1;
      humeur(b === 'B6' ? R.humeur.b6_regle_par_le_heros : R.humeur.besoin_regle);
      const soins = [];
      if (b === 'B6') {
        for (const v of p.villageois) if (v.etat === 'blesse') {
          v.remede = true;
          if (o.remede === 'aussitot') v.gueritA = p.t;
          else if (o.remede === 'apres-delai') v.gueritA = Math.min(v.gueritA, p.t + R.remede.reprise_apres_h);
          soins.push(v.nom);
        }
      }
      p.services++; p.stats.regleesHeros++;
      let rep;
      const etapes = R.mefiance.etapes_pct;
      if (p.etat === 'amical') { p.servicesApresAmical++; rep = 'le hameau est déjà « Amical » : le service est compté, sans effet (paliers au-delà à définir)'; }
      else if (p.etat === 'mefiant') {
        p.etape = Math.min(p.etape + R.etapes_par_demande.etapes, etapes.length - 1);
        const n = R.etapes_par_demande.etapes;
        if (p.etape === etapes.length - 1) { p.etat = 'amical'; rep = `la méfiance tombe à ${etapes[etapes.length - 1]} : le hameau devient « Amical » (prix ${String(R.amical.prix_pct).replace('-', '−')} %)`; }
        else rep = `la méfiance du hameau baisse ${n === 1 ? 'd\'une étape' : `de ${n} étapes`} (prix +${etapes[p.etape]} %)`;
      } else rep = 'le hameau reste ' + p.etat;
      fermer(d, 'heros');
      noter(`${INFO[b].heros_fait} : ${INFO[b].le} baisse de ${-R.demande_reglee.baisse} (${arr(av)} → ${arr(ap)}). Il gagne ${pts} points d'expérience (${metier === 'attente' ? 'compteur d\'attente' : metier})${objet ? ', ' + objet : ''}${R.or[b] ? ' et ' + R.or[b] + ' pièce' + (R.or[b] > 1 ? 's' : '') : ''} ; ${rep}.${soins.length ? ' Remède donné à ' + liste(soins) + '.' : ''}`, 'heros', true);
    }

    // --- conscience collective -----------------------------------------------------------------------------------------
    function ordonner(b, raison) {
      if (p.fige[b] || p.ordres[b] || p.taches.some((t) => t.besoin === b)) return;
      // choix de la simulation (signalé dans la page) : le héros a accepté, on le laisse finir, même à 100
      if (p.demandes.some((d) => d.besoin === b && d.acceptee !== null)) return;
      p.ordres[b] = { raison, depuis: p.t, attente: false };
    }
    function nombreEnvoyes(val) {
      let n = 0;
      for (const [seuil, k] of R.envoyes.paliers) if (val >= seuil) n = k;
      return n;
    }
    function equipe(b, n) {
      const jamais = R.jamais_envoyes.roles;
      const duRole = (v) => ROLES[v.role].besoin === b && v.role !== 'paysan';
      const groupe = (v) => (duRole(v) ? 0 : 1);
      const propre = (v) => (ROLES[v.role].besoin ? p.besoins[ROLES[v.role].besoin] : BMAX);
      const c = p.villageois.filter((v) => valide(v) && !v.tache && !jamais.includes(v.role) && (duRole(v) || v.role === 'paysan'))
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
          if (r < sort.mort_pct / 100 && o.morts === 'oui') { tuer(v); suites.push(`${v.nom} ne revient pas : ${v.genre === 'f' ? 'elle' : 'il'} est mort${e(v)}`); }
          else if (r < (sort.mort_pct + sort.blesse_pct) / 100) suites.push(blesser(v, 'revient blessé' + e(v)).replace(`${v.nom} revient blessé${e(v)} : `, `${v.nom} revient `));
        }
        if (b === 'B2' && p.troupeau > 0) { const k = Math.min(p.troupeau, R.troupeau.perte_echec); p.troupeau -= k; p.stats.betesPerdues += k; suites.push(`${betes(k)} (troupeau : ${p.troupeau})${plusDeBetes()}`); }
        if (b === 'B4') { const o4 = changer('B4', R.b4.outil_perdu); suites.push(`un outil est perdu (outils +${R.b4.outil_perdu} : ${arr(o4[1])})`); }
        noter(`${INFO[b].tache_nom} a échoué : ${INFO[b].le} ne baisse que de ${-R.baisse_tache.echec} (${arr(av)} → ${arr(ap)})${suites.length ? '. ' + suites.join('. ') : ''}.`, 'conscience', true);
      }
      if (p.besoins[b] >= P.urgence) ordonner(b, 'reste-haut');
    }

    // --- bêtes, crises, rumeurs ----------------------------------------------------------------------------------------
    const betes = (k) => `${k} bête${k > 1 ? 's' : ''} perdue${k > 1 ? 's' : ''}`;
    function plusDeBetes() {   // § 8 : « à 0 bête, B2 ne monte plus » ; figé comme le transcrit reglages.json (zero_bete_b2_fige)
      if (p.troupeau > 0 || !R.troupeau.zero_bete_b2_fige || p.fige.B2) return '';
      p.fige.B2 = true; p.sansBetes = true;
      delete p.ordres.B2;
      const suites = [];
      for (const d of p.demandes.filter((y) => y.besoin === 'B2')) {
        fermer(d, 'sans-betes');
        if (p.heros.demande === d.id) { p.heros.finA = null; p.heros.demande = null; }
        suites.push(`la demande de ${d.nomDemandeur} est retirée`);
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
    function perteCrise(b) {
      const pc = R.pertes_crise;
      let txt = '';
      if (b === 'B1') { p.hausseB1.push(p.t + pc.B1.apres_h); txt = `des réserves sont gâchées : ${INFO.B1.le} montera encore de ${pc.B1.hausse} dans ${pc.B1.apres_h} h`; }
      if (b === 'B2') { const k = Math.min(p.troupeau, pc.B2.betes); p.troupeau -= k; p.stats.betesPerdues += k; txt = `${betes(k)} (troupeau : ${p.troupeau})${plusDeBetes()}`; }
      if (b === 'B3' || b === 'B5') {
        const c = eligiblesPertes();
        const ks = [];
        for (let i = 0; i < pc[b].blesses && c.length; i++) ks.push(blesser(c.splice(Math.floor(rnd.village() * c.length), 1)[0], b === 'B3' ? 'souffre du froid' : (w) => `est attaqué${e(w)} par des bêtes`));
        txt = ks.length ? ks.join(' ; ') : 'personne de valide à blesser';
      }
      if (b === 'B4') { p.travailMoins = true; txt = `tout le monde travaille ${-pc.B4.travail_pct} % moins vite jusqu'au retour des outils sous ${pc.B4.jusqu_a_moins_de}`; }
      if (b === 'B6') {
        const ks = [];
        for (const v of p.villageois) if (v.etat === 'blesse' && !(v.remede && R.remede.protege_de_la_mort_b6)) {
          if (rnd.village() < pc.B6.mort_pct / 100 && o.morts === 'oui') { tuer(v); ks.push(`${v.nom} meurt de ses blessures`); }
        }
        txt = ks.length ? ks.join(' ; ') : 'les blessés tiennent bon';
      }
      p.stats.crises++; p.stats.criseParBesoin[b]++;
      noter(`CRISE : ${INFO[b].le} est à ${BMAX}. ${Maj(txt)}.`, 'crise', true);
    }
    function rumeur(x) {
      if (p.silenceSoir) { p.silenceSoir = false; noter('ce soir, l\'auberge se tait : le hameau pleure son mort.', 'rumeur', false); return; }
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
      for (const v of p.villageois) if (v.etat === 'blesse' && v.gueritA <= p.t) { v.etat = 'valide'; v.gueritA = null; v.remede = false; noter(`${v.nom} est guéri${e(v)} et reprend le travail.`, 'blessure', false); }
      for (const r of p.remplacements.filter((y) => y.t <= p.t)) {
        const c = p.villageois.filter((v) => vivant(v) && v.role === 'paysan').sort((a, z) => (valide(z) - valide(a)));
        if (c.length) { const v = c[0]; v.role = r.role; noter(`${v.nom}, ${nomRole(v, 'paysan')}, reprend le poste de ${ROLES[r.role].nom} laissé par ${r.mort}.`, 'hameau', true); }
        else noter(`plus aucun paysan pour reprendre le poste de ${ROLES[r.role].nom} laissé par ${r.mort}.`, 'hameau', true);
      }
      p.remplacements = p.remplacements.filter((y) => y.t > p.t);
      if (p.heros.finA !== null && p.heros.finA <= p.t) finirHeros();
      for (const t of p.taches.filter((y) => y.reste <= 0)) finirTache(t, x);
      if (x.h === x.crep) coucher();
      if (x.h === x.hor.aubD) rumeur(x);
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
          fermer(d, 'delai-file'); if (p.heros.demande === d.id) { p.heros.finA = null; p.heros.demande = null; }
          noter(`le héros n'a pas fini à temps : ${d.nomDemandeur} est déçu${e(parId(d.demandeur))} (réplique seulement ; la méfiance ne change pas).`, 'heros', true);
          ordonner(d.besoin, 'delai');
        }
      }
      // nouvelles demandes (à 60), sinon la conscience prend le besoin dès 80
      for (const b of BES) {
        if (p.fige[b]) continue;
        const val = p.besoins[b];
        if (val < P.demande) continue;
        const raison = raisonSansDemande(b);
        if (!raison) {
          const debout = demandeurPossible(b).filter((v) => x.h >= x.hor.lever && x.h < x.hor.aubF);
          if (debout.length) ouvrirDemande(b, x, debout);
        } else if (val >= R.conscience_quand.sans_demande_possible_a && !p.demandes.some((d) => d.besoin === b) && !p.ordres[b] && !p.taches.some((t) => t.besoin === b)) {
          ordonner(b, 'sans-demande');
          if (p.ordres[b]) noter(`${INFO[b].le} est à ${arr(val)} et aucune demande ne peut s'ouvrir (${raison}) : la conscience s'en charge.`, 'conscience', true);
        }
      }
      // le héros simulé
      const h = p.heros;
      if (h.finA === null && h.mode !== 'rien') {
        const c = p.demandes.filter((d) => d.acceptee === null && p.t >= d.ouverte + R.heros_tout.accepte_apres_h && (h.mode === 'tout' || d.parfois))
          .sort((a, z) => a.delai - z.delai);
        if (c.length) accepter(c[0]);
      }
      lancerOrdres(x);
    }

    function debutHeure() {   // arrivée à l'heure p.t : calendrier, météo, événements, puis où est chacun
      if (p.t > 0 && heureDe(p.t) === 0) {   // minuit : jour suivant du calendrier
        const c = p.cal;
        c.jour++;
        if (c.jour > R.saisons.jours) { c.saison = suivante(c.saison); c.jour = PREMIER_JOUR; if (o.modeSaison !== 'figee') noter(`début de la saison : ${c.saison}, jour ${PREMIER_JOUR}.`, 'saison', true); }
        else if (c.jour === R.glissement.premier_jour && o.modeSaison !== 'figee') noter(`${c.saison}, jour ${c.jour} : le temps, les besoins et les horaires glissent chaque jour vers ceux de la saison suivante (${suivante(c.saison)}).`, 'saison', true);
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
      const ligne = { t: p.t, b: BES.map((b) => Math.round(p.besoins[b] * 10) / 10), nuit: x.nuit, tempete: x.tempete, humeur: Math.round(p.humeur) };
      if (last && last.t === p.t) p.historique[p.historique.length - 1] = ligne; else p.historique.push(ligne);
    }
    function resumeFin() {
      const s = p.stats;
      return `${s.demandes} demandes d'aide (${s.regleesHeros} réglées par le héros, ${s.personne} sans réponse) ; ${s.taches} tâches de la conscience (${s.reussites} réussies, ${s.echecs} échouées) ; ${s.blesses} blessés, ${s.morts} morts, ${s.betesPerdues} bêtes perdues, ${s.crises} crises ; humeur ${arr(p.humeur)}.`;
    }

    // --- départ ------------------------------------------------------------------------------------------------------
    {
      const x = contexte();
      const fig = Object.keys(p.fige).filter((b) => p.fige[b]).map((b) => INFO[b].nom.toLowerCase());
      noter(`début de la partie au Hameau de la Brume (${calEffectif().saison}, jour ${calEffectif().jour}${o.modeSaison === 'figee' ? ', saison figée' : ''}) pour ${o.journees} journée${o.journees > 1 ? 's' : ''}. Graine ${o.graine}. Héros : ${{ rien: 'ne fait rien', tout: 'répond à tout', parfois: 'répond parfois' }[p.heros.mode]}. Hameau ${{ mefiant: 'méfiant', amical: '« Amical »', hostile: 'hostile', apeure: 'apeuré' }[p.etat]}.${fig.length ? ' Figé (quête écrite pas encore faite) : ' + fig.join(', ') + '.' : ''}${p.loup ? ' Le loup garde le troupeau (issue 2 de « L\'Agneau et le Loup »).' : ''}`, 'info', true);
      tirerMeteo(x, false);
      if (p.meteo.type !== 'clair' && p.meteo.type !== 'tempete') noter(`${METEO[p.meteo.type]} pour ${p.meteo.reste} h.`, 'meteo', false);
      debutHeure();
    }

    // --- ce que voit la page --------------------------------------------------------------------------------------------
    function vue() {
      const x = contexte(), c = calEffectif();
      const etapes = R.mefiance.etapes_pct;
      return {
        t: p.t, fin: p.fin, finie: p.finie, quand: quand(p.t), jour: jourDe(p.t), heure: heureDe(p.t), journees: o.journees,
        saison: c.saison, jourSaison: c.jour, glissement: o.modeSaison !== 'figee' ? part(c) : 0, suivante: suivante(c.saison),
        figee: o.modeSaison === 'figee', nuit: x.nuit, aube: x.aube, crep: x.crep, horaire: x.hor,
        meteo: { type: p.meteo.type, nom: METEO[p.meteo.type], reste: p.meteo.reste,
          // lignes du § 8 qui donnent les chances : celle de la saison, et celle de la suivante pendant le glissement
          lignes: [...new Set([ligneMeteo(c.saison, c.jour)].concat(part(c) > 0 ? [ligneMeteo(suivante(c.saison), PREMIER_JOUR)] : []))] },
        besoins: BES.map((b) => ({ id: b, nom: INFO[b].nom, valeur: p.besoins[b], fige: !!p.fige[b], sansBetes: b === 'B2' && !!p.sansBetes, crise: !!p.crise[b],
          ordre: p.ordres[b] ? p.ordres[b].raison : null, tache: p.taches.some((t) => t.besoin === b) })),
        demandes: p.demandes.map((d) => Object.assign({}, d, { delaiTexte: quandCourt(d.delai), ouverteTexte: quandCourt(d.ouverte), nomBesoin: INFO[d.besoin].nom })),
        taches: p.taches.map((t) => ({ besoin: t.besoin, nom: INFO[t.besoin].tache, noms: t.equipe.map((i) => parId(i).nom), reste: t.reste, active: t.active })),
        villageois: p.villageois.map((v) => ({ id: v.id, nom: v.nom, role: v.role, roleNom: nomRole(v), roleDepart: v.roleDepart,
          provisoire: v.provisoire, nomme: ROLES[v.roleDepart].nomme, etat: v.etat, lieu: v.lieu, activite: v.activite })),
        lieux: LIEUX,
        heros: { mode: p.heros.mode, occupe: p.heros.finA !== null, finTexte: p.heros.finA !== null ? quandCourt(p.heros.finA) : null,
          demande: p.heros.demande, xp: Object.assign({}, p.heros.xp), or: p.heros.or, objets: Object.assign({}, p.heros.objets) },
        hameau: { etat: p.etat, mefiance: p.etat === 'mefiant' || p.etat === 'amical' ? etapes[p.etape] : null,
          etape: p.etape, etapes: etapes.length - 1, amicalPrix: R.amical.prix_pct, services: p.services, servicesApresAmical: p.servicesApresAmical,
          humeur: p.humeur, etatHumeur: p.etatHumeur, troupeau: p.troupeau, troupeauDepart: R.troupeau.depart,
          habitants: R.habitants.habitants - p.stats.morts, travailMoins: p.travailMoins },
        prix: Object.keys(p.prix).map((b) => ({ besoin: b, bien: R.prix.biens[b], hausse: p.prix[b] ? R.prix.hausse_pct : 0 })),
        stats: JSON.parse(JSON.stringify(p.stats)),
      };
    }
    function texteJournal() { return p.journal.map((j) => `${j.quand} : ${j.texte}`).join('\n'); }

    return {
      reglages: R, options: o, journal: p.journal, historique: p.historique, besoinsIds: BES,
      avancer: heure, vue, texteJournal, resumeFin,
      finie: () => p.finie,
      changerHeros(mode) { p.heros.mode = mode; noter(`le comportement du héros change : ${{ rien: 'ne fait rien', tout: 'répond à tout', parfois: 'répond parfois' }[mode]}.`, 'heros', false); },
      forcerTempete() {
        if (p.finie) return;
        tirerMeteo(contexte(), true); majActivites(contexte()); enregistrer(contexte());
      },
      forcerMeute() { if (p.finie) return; meute(rnd.force, '(forcé) '); enregistrer(contexte()); },
      forcerSaison() {
        if (p.finie) return;
        const c = calEffectif(), s = suivante(c.saison);
        c.saison = s; c.jour = PREMIER_JOUR;
        if (o.modeSaison === 'figee') { p.cal.saison = s; p.cal.jour = PREMIER_JOUR; }
        noter(`(forcé) changement de saison : ${s}, jour ${PREMIER_JOUR}, valeurs pleines, sans glissement.`, 'saison', true);
        majActivites(contexte()); enregistrer(contexte());
      },
      repondre(id) {   // le joueur répond lui-même : le héros accepte la demande
        if (p.finie) return 'partie finie';
        const d = p.demandes.find((y) => y.id === id);
        if (!d) return 'demande fermée';
        if (d.acceptee !== null) return 'déjà acceptée';
        if (p.heros.finA !== null) return 'le héros est déjà occupé';
        accepter(d); return null;
      },
    };
  }

  const api = { creerPartie };
  if (typeof module === 'object' && module.exports) module.exports = api; else racine.SimHameau = api;
})(typeof self !== 'undefined' ? self : this);
