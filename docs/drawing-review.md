# Drawing Review

Open the **Drawings** area from the OpenCalcs workspace navigation. Select an OpenCalcs project,
add one or more PDFs, and mark beams, columns, and areas directly on the rendered pages. Each mark
can carry an element ID and a link to a calculation run.

The calculation panel reads the authenticated OpenCalcs calculation library. Runs use the existing
project calculation endpoint, so the result is saved to the selected project and keeps its module,
definition version, inputs, output, and run ID. Selecting a linked markup shows its calculation
snapshot in the drawing review panel.

PDF bytes and annotations stay in the browser's IndexedDB, separated by the selected OpenCalcs
project. They are not uploaded to OpenCalcs. Export a marked PDF to carry the vector markups and
a JSON sidecar with linked OpenCalcs run references and calculation snapshots. Browser-local
drawing sets do not sync to another device.

This first version links existing OpenCalcs module calculations. It does not derive member forces
from drawing geometry or verify beam, column, connection, or member capacity.
