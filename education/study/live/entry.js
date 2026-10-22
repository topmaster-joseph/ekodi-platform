// Learner entry page (/edu/factchat/): instructor card from the single instructor data source.
import {INSTRUCTOR} from './courses/instructor.js';
import {instructorCard} from './engine/render.js';
import {livePath} from './engine/model.js';
const slot=document.getElementById('instructorSlot');
if(slot)slot.innerHTML=instructorCard(INSTRUCTOR,livePath(location.pathname,''));
document.body.dataset.ready='true';
