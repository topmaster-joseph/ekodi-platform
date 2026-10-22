// Reads the instructor password from EDU_INSTRUCTOR_PASSWORD and prints only its PBKDF2 verifier.
// Used by the release workflow to provision the Worker secret EDU_INSTRUCTOR_GATE_SECRET; the password
// itself is never printed, written to disk or committed.
import {createVerifier,verifyPassword,MIN_CUSTOM_PASSWORD_LENGTH} from '../education-instructor-gate.js';
const password=process.env.EDU_INSTRUCTOR_PASSWORD||'';
if(password.length<MIN_CUSTOM_PASSWORD_LENGTH||password.length>128){
  console.error('EDU_INSTRUCTOR_PASSWORD must be '+MIN_CUSTOM_PASSWORD_LENGTH+'–128 characters.');
  process.exit(2);
}
const verifier=await createVerifier(password);
if(!(await verifyPassword(password,verifier)))process.exit(3);
process.stdout.write(verifier);
