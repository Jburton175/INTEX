let express = require('express');
let app = express();
const path = require('path');
const session = require('express-session');
const PORT = process.env.PORT || 3000;

// Middleware for parsing request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files (CSS, images, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Set up EJS for templating
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Initialize session middleware
app.use(session({
    secret: 'intex2346235346', // Replace with a strong secret key
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Use `true` for HTTPS
}));

const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.RDS_HOSTNAME || "localhost",
        user: process.env.RDS_USERNAME || "postgres",
        password: process.env.RDS_PASSWORD || "leomessi",
        database: process.env.RDS_DB_NAME || "intex_local",
        port: process.env.RDS_PORT || 5432,
        ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
    }
});

// Excluded routes that don't require login
const excludedRoutes = ['/', '/login', '/requestEvent', '/addVolunteer','/createRequest'];

// Middleware to enforce login check
app.use((req, res, next) => {
    // Skip excluded routes and favicon.ico
    if (excludedRoutes.includes(req.path) || req.path === '/favicon.ico') {
        return next();
    }

    // Redirect to login if no session exists
    if (!req.session.volunteer) {
        console.log('Access denied. Redirecting to login.');
        return res.redirect('/login');
    }

    if (req.session.volunteer.role_name !== "Admin") {
        console.log('Access denied. Redirecting to dashboard.');
        return res.redirect('/dashboard');
    }
    

    next(); // Allow access if logged in
});

// Login route
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    knex('volunteers')
        .join('roles', 'roles.role_id', '=', 'volunteers.role_id')
        .select('volunteers.vol_id', 'roles.role_name')
        .where("vol_email", username)
        .where("password", password) // Replace with hashed password comparison
        .first()
        .then(volunteer => {
            if (volunteer) {
                req.session.volunteer = volunteer; // Save volunteer to session
                console.log('Volunteer logged in:', req.session.volunteer);
                res.redirect('/dashboard');
            } else {
                console.log('Invalid username or password');
                res.status(401).send("Invalid username or password");
            }
        })
        .catch(error => {
            console.error('Error during database query:', error.stack);
            res.status(500).send('Database query failed: ' + error.message);
        });
});


// Logout route
app.get('/logout', (req, res) => {
    // Destroy the session
    req.session.destroy(err => {
        if (err) {
            console.error('Error during session destruction:', err.stack);
            return res.status(500).send('Failed to log out. Please try again.');
        }

        // Redirect to the login page after logging out
        res.redirect('/login');
    });
});


// Dashboard route (protected)
app.get('/dashboard', (req, res) => {
    console.log('Session on /dashboard:', req.session); // Debug session
    if (req.session.volunteer) {
        console.log('Logged-in role:', req.session.volunteer.role_name);

        // Get the current date and time
        const now = new Date();

        if (req.session.volunteer.role_name === "Admin") {
            knex("events")
                .select(
                    "events.*", 
                    "event_status.event_status_name",
                    "event_type.event_type_name",
                    knex.raw("COUNT(ev.vol_id) as volunteers_signed_up")
                )
                .join("event_status", "events.event_status_id", "=", "event_status.status_id")
                .join("event_type", "events.event_type_id", "=", "event_type.event_type_id")
                .leftJoin("event_volunteers as ev", "ev.event_id", "=", "events.event_id")
                .where("events.event_datetime", ">", now) // Only include events after the current date
                .where("event_status.event_status_name", "<>", "Canceled")
                .groupBy(
                    "events.event_id",
                    "event_status.event_status_name",
                    "event_type.event_type_name"
                ) // Include all selected non-aggregated fields
                .orderBy("event_datetime", "asc")
                .then(vol_events => {
                    res.render("dashboard", { volunteer: req.session.volunteer, vol_events });
                })
                .catch(error => {
                    console.error("Admin Query Error:", error);
                    res.status(500).send("Error fetching admin events.");
                });
        } else {
            knex("events")
                .join("event_status", "events.event_status_id", "=", "event_status.status_id")
                .join("event_type", "events.event_type_id", "=", "event_type.event_type_id")
                .leftJoin("event_volunteers as ev_signed_up", function () {
                    this.on("ev_signed_up.event_id", "=", "events.event_id")
                        .andOn("ev_signed_up.vol_id", "=", req.session.volunteer.vol_id);
                })
                .leftJoin("event_volunteers as ev", "ev.event_id", "=", "events.event_id") // Count volunteers
                .select(
                    "events.*",
                    "ev_signed_up.vol_id as signed_up_vol_id", // Alias this for clarity
                    "event_status.event_status_name",
                    "event_type.event_type_name",
                    knex.raw("COUNT(ev.vol_id) as volunteers_signed_up")
                )
                .where("events.event_datetime", ">", now) // Only include events after the current date
                .where("event_status.event_status_name", "<>", "Canceled")
                .groupBy(
                    "events.event_id",
                    "ev_signed_up.vol_id",
                    "event_status.event_status_name",
                    "event_type.event_type_name"
                ) // Include all selected non-aggregated fields
                .orderBy("event_datetime", "asc")
                .then(vol_events => {
                    res.render("dashboard", { volunteer: req.session.volunteer, vol_events });
                })
                .catch(error => {
                    console.error("Volunteer Query Error:", error);
                    res.status(500).send("Error fetching volunteer events.");
                });
        }
    } else {
        console.log("No session found. Redirecting to login.");
        res.redirect("/login");
    }
});




// Define route for home page
app.get('/', (req, res) => {
  res.render('index');

});


app.get('/login', (req, res) => {
  res.render('login');

});

app.post('/signupEvent/:event_id', (req, res) => {
    const eventId = req.params.event_id;
    const volunteerId = req.session.volunteer.vol_id;

    knex('event_volunteers')
        .where({ event_id: eventId, vol_id: volunteerId })
        .first()
        .then((existingSignup) => {
            if (existingSignup) {
                console.log("You are already signed up for this event.");
                return res.redirect('/dashboard');
            }

            return knex('event_volunteers')
                .insert({ event_id: eventId, vol_id: volunteerId })
                .then(() => {
                    res.redirect('/dashboard');
                });
        })
        .catch((error) => {
            console.error('Error signing up:', error);
            res.status(500).send('An error occurred during sign up.');
        });
});




app.post('/deleteSignup/:eventId', (req, res) => {
    const eventId = req.params.eventId;
    const volunteerId = req.session.volunteer.vol_id;

    knex('event_volunteers')
        .where({ event_id: eventId, vol_id: volunteerId })
        .del()
        .then(() => {
            console.log(`Volunteer ${volunteerId} removed from event ${eventId}`);
            res.redirect('/dashboard'); // Redirect back to the dashboard after deletion
        })
        .catch(err => {
            console.error('Error deleting signup:', err);
            res.status(500).send('Error deleting signup');
        });
});



// Serve static files (e.g., CSS) if needed
// app.use(express.static('public'));

app.get('/manageRequests', (req, res) => {
    knex("requests")
    .join('request_status', 'requests.request_status_id', '=', 'request_status.request_status_id')
    .join('event_type', 'requests.req_type_id', '=', 'event_type.event_type_id')
    .join('location_type', 'requests.location_type_id', '=', 'location_type.location_type_id')
    .select(
        "requests.request_id",
        "requests.request_datetime",
        "requests.organization_name",
        "requests.contact_phone",
        "requests.est_attendees",
        "requests.basic_sewers",
        "requests.advanced_sewers",
        "requests.proposed_datetime",
        "requests.alt_datetime",
        "requests.est_duration",
        "requests.contact_first_name",
        "requests.contact_last_name",
        "requests.num_machines",
        "requests.num_sergers",
        "requests.contact_email",
        "requests.jen_story",
        "requests.request_status_id as request_status",
        "requests.req_street_1",
        "requests.req_street_2",
        "requests.req_city",
        "requests.req_state",
        "requests.req_zip",
        "requests.req_type_id",
        "requests.notes",
        "requests.location_type_id",
        "request_status.request_status_id",
        "request_status.request_status_name",
        "event_type.event_type_name",
        "location_type.location_type_id",
        "location_type.location_type_name"
        )
    .where('requests.request_status_id', 1)
    .then(requests => { // selects all the info from the requests table and passes it to display characters ejs
        res.render("manageRequests", {myrequests : requests});
        console.log(requests)
    })
    .catch( err => {
        console.log(err);
        res.status(500).json({err});
    });
  });

  app.get('/createRequest', (req, res) => {
    knex("event_type")
    .select(
        "event_type_id",
        "event_type_name"
    )
    .then(eventTypes => { // selects all the info from the requests table and passes it to display characters ejs

        knex("location_type")
        .select(
            "location_type_id",
            "location_type_name"
        )
        .then(locations => {
            
            const states = [
                "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
                "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
                "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
                "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
                "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
            ];
    
            const hours = [];
            for (let i = 1; i <= 12; i++) {
                hours.push(i); // Add whole hours
                if (i < 12) {
                hours.push(i + 0.5); // Add half hour increments
            }}
    
            res.render("createRequest", {eventTypes, locations, states, hours});
        

        })
    })
    .catch( err => {
        console.log(err);
        res.status(500).json({err});
    });
});

app.post('/createRequest', (req, res) => {
    
    const contact_first_name = req.body.contact_first_name; // Access each value directly from req.body
    const contact_last_name = req.body.contact_last_name;
    const organization_name = req.body.organization_name;
    const contact_phone = req.body.contact_phone;
    const est_attendees = req.body.est_attendees;
    const basic_sewers = req.body.basic_sewers;
    const advanced_sewers = req.body.advanced_sewers;
    const proposed_datetime = req.body.proposed_datetime;
    const alt_datetime = req.body.alt_datetime;
    const est_duration = req.body.est_duration;
    const num_machines = req.body.num_machines;
    const num_sergers = req.body.num_sergers;
    const contact_email = req.body.contact_email;
    const jen_story = req.body.jen_story === 'on' ? true : false;
    const request_status_id = 1;
    const req_street_1 = req.body.req_street_1;
    const req_street_2 = req.body.req_street_2;
    const req_city = req.body.req_city;
    const req_state = req.body.req_state;
    const req_zip = req.body.req_zip;
    const req_type_id = req.body.req_type_id;
    const location_type_id = req.body.location_type_id;
    const notes = req.body.notes;

    knex('requests').insert({
        contact_first_name: contact_first_name,
        contact_last_name: contact_last_name,
        organization_name: organization_name,
        contact_phone: contact_phone,
        est_attendees: est_attendees,
        basic_sewers: basic_sewers,
        advanced_sewers: advanced_sewers,
        proposed_datetime: proposed_datetime,
        alt_datetime: alt_datetime,
        est_duration: est_duration,
        num_machines: num_machines,
        num_sergers: num_sergers,
        contact_email: contact_email,
        jen_story: jen_story,
        request_status_id: request_status_id,
        req_street_1: req_street_1,
        req_street_2: req_street_2,
        req_city: req_city,
        req_state: req_state,
        req_zip: req_zip,
        req_type_id: req_type_id,
        location_type_id: location_type_id,
        notes: notes
    }).then(myrequests => {
        res.redirect("/");
        console.log(req.body)
    }).catch( err => {
        console.log(err);
        res.status(500).json({err});
    });
});


app.post('/denyRequest/:request_id', (req, res) => {
    const reqstatus = 3
    // Update the character in the database
    knex('requests')
      .where('request_id', parseInt(req.params.request_id))
      .update({
        request_status_id: reqstatus 
      })
      .then(myrequests => {
        res.redirect('/manageRequests'); // Redirect to the list of requests
      })
      .catch(error => {
        console.error('Error updating character:', error);
        res.status(500).send('Internal Server Error');
      });
});

// render the addVolunteer page
app.get('/addVolunteer', (req, res) => {
  knex('sewing_proficiency')
      .select('level_id', 'level') // Query sewing_proficiency
      .then(proficiency => {
          knex('roles')
              .select('role_id', 'role_name') // Query roles
              .then(role => {
                  knex('vol_source')
                      .select('source_id', 'source_type') // Query vol_source
                      .then(source => {
                          // Render the EJS template with all data
                          res.render('addVolunteer', { proficiency, role, source });
                      })
                      .catch(error => {
                          console.error('Error fetching sources: ', error);
                          res.status(500).send('Internal Server Error');
                      });
              })
              .catch(error => {
                  console.error('Error fetching roles: ', error);
                  res.status(500).send('Internal Server Error');
              });
      })
      .catch(error => {
          console.error('Error fetching proficiency: ', error);
          res.status(500).send('Internal Server Error');
      });
});



app.post('/addVolunteer', (req, res) => {
    const firstname = req.body.firstName || '';  // Access form data sent via POST
    const lastname = req.body.lastName || '';  
    const email = req.body.email || '';  
    const phone = req.body.phone || '';  
    const password = req.body.password;  
    const sAddress1 = req.body.address1 || '';  
    const sAddress2 = req.body.address2 || '';  
    const city = req.body.city || '';  
    const state = req.body.state || '';  
    const zip = req.body.zip || '';  
    const source = parseInt(req.body.source);  
    const sew_id = parseInt(req.body.sewLevel) || 1;  
    const hours = parseInt(req.body.hours) || 0;  
    // const formData = req.body;
    // console.log(formData);
    // console.log(formData);
    console.log('Request body:', req.body);
  
    knex('volunteers')
        .insert({
            vol_first_name: firstname,
            vol_last_name: lastname, 
            vol_phone: phone,
            vol_email: email,
            password: password,
            role_id: 2,
            vol_street_1: sAddress1,
            vol_street_2: sAddress2,
            vol_city: city,
            vol_state: state.toUpperCase(),
            vol_zip: zip,
            source_id: source,
            vol_sew_level_id: sew_id,
            vol_hours_per_month: hours,
            
        })
        .then(() => {
            console.log('Form submitted successfully!');
            console.log('Request body:', req.body);
            res.redirect('/login'); 
        })
  
        .catch(error => {
            console.error('Error adding a volunteer:', error);
            console.log('Request body:', req.body);
            res.status(500).send('Internal Server Error');

        });
  });


// render page to edit a volunteer
app.get('/editVolunteer/:id', (req, res) => {
  let id = req.params.id
  
  knex('volunteers')
  .where('vol_id', id)
  .first()
  .then(volunteer => {
      if (!volunteer) {
          return res.status(404).send('Volunteer not found');
      }

      // query for sewing proficiency dropdown
      knex('sewing_proficiency')
      .select('level_id', 'level') 
      .then(proficiency => {
          // query for roles dropdown
          knex('roles')
              .select('role_id', 'role_name')
              .then(role => {
                  // query for source dropdown
                  knex('vol_source')
                      .select('source_id', 'source_type') 
                      .then(source => {
                          // Render the EJS template with all data
                          res.render('editVolunteer', { volunteer, proficiency, role, source });
                      })
                      .catch(error => {
                          console.error('Error fetching sources: ', error);
                          res.status(500).send('Internal Server Error');
                      });
              })
              .catch(error => {
                  console.error('Error fetching roles: ', error);
                  res.status(500).send('Internal Server Error');
              });
      })
      .catch(error => {
          console.error('Error fetching proficiency: ', error);
          res.status(500).send('Internal Server Error');
      });
  })
  .catch(error => {
      console.error('Error fetching volunteer: ', error);
      res.status(500).send('Internal Server Error');
  });
})



// post edits to a volunteer
app.post('/editVolunteer/:id', (req, res) => {
  const id = req.params.id;

  const firstname = req.body.firstName;  // Access form data sent via POST
  const lastname = req.body.lastName;  
  const email = req.body.email;  
  const phone = req.body.phone;  
  const password = req.body.password;  
  const sAddress1 = req.body.address1;  
  const sAddress2 = req.body.address2;  
  const city = req.body.city;  
  const state = req.body.state;  
  const zip = req.body.zip;  
  const source = parseInt(req.body.source); 
  const role = parseInt(req.body.role);
  const sew_id = parseInt(req.body.sewLevel);  
  const hours = parseInt(req.body.hours);  
  // const formData = req.body;
  // console.log(formData);
  // console.log(formData);       // For demonstration, log the submitted data
  console.log('Request body:', req.body);

  knex('volunteers')
      .where('vol_id', id)
      .update({
          vol_first_name: firstname,
          vol_last_name: lastname, 
          vol_phone: phone,
          vol_email: email,
          password: password,
          role_id: role,
          vol_street_1: sAddress1,
          vol_street_2: sAddress2,
          vol_city: city,
          vol_state: state.toUpperCase(),
          vol_zip: zip,
          source_id: source,
          vol_sew_level_id: sew_id,
          vol_hours_per_month: hours,
          
      })
      .then(() => {
          console.log('Form submitted successfully!');
          console.log('Request body:', req.body);
          res.redirect('/manageUsers'); 
      })

      .catch(error => {
          console.error('Error adding a volunteer:', error);
          console.log('Request body:', req.body);
          res.status(500).send('Internal Server Error');

      });
});



// route for admin to view all volunteers (manageUsers page)
app.get('/manageUsers', (req, res) => {
  knex('volunteers')
  .join('roles', 'volunteers.role_id', '=', 'roles.role_id')
  .join('sewing_proficiency', 'volunteers.vol_sew_level_id', '=', 'sewing_proficiency.level_id')
  .join('vol_source', 'volunteers.source_id', '=', 'vol_source.source_id')
  .select(
      'volunteers.vol_id',
      'volunteers.vol_first_name',
      'volunteers.vol_last_name',
      'volunteers.vol_email',
      'volunteers.vol_phone',
      'volunteers.password',
      'volunteers.vol_street_1',
      'volunteers.vol_street_2',
      'volunteers.vol_city',
      'volunteers.vol_state',
      'volunteers.vol_zip',
      'volunteers.vol_signup_date',
      'volunteers.vol_hours_per_month',
      'volunteers.source_id',
      'volunteers.vol_sew_level_id',
      'volunteers.role_id',
      'vol_source.source_type as vol_source_type',
      'sewing_proficiency.level as vol_sewing_level',
      'roles.role_name as vol_role'
  )
  .orderBy('vol_signup_date', 'asc')
  .then(volunteers => {
      res.render('manageUsers', { volunteers });
  })
  .catch(error => {
      console.error('Error querying database: ', error);
      res.status(500).send('Internal Server Error');
  });
});

app.get('/manageEvents', (req, res) => {
    knex('events')
    .join('volunteers', 'events.supervisor_id', '=', 'volunteers.vol_id')
    .join('event_status', 'events.event_status_id', '=', 'event_status.status_id')
    .join('event_type', 'events.event_type_id', '=', 'event_type.event_type_id')
    .join('location_type', 'events.location_type_id', '=', 'location_type.location_type_id')
    .select(
        "events.event_id", // ghost
	    "events.request_id", // ghost
	    "events.event_datetime",
        "events.organization_name",
	    "events.supervisor_id", // name of supervisor, from volunteers
	    "events.event_status_id", // from event_status table we need the name
	    "events.event_type_id", // from the table we need the type name
	    "events.event_street_1",
	    "events.event_street_2",
	    "events.event_city",
	    "events.event_state",
	    "events.event_zip",
	    "events.location_type_id", // get the location type
	    "events.participants",
	    "events.event_duration",
	    "events.pockets",
	    "events.collars",
	    "events.envelopes",
	    "events.vests",
	    "events.completed_products",
	    "events.distributed_products",
	    "events.volunteers_needed",
        "volunteers.vol_first_name",
        "volunteers.vol_last_name",
        "event_status.event_status_name",
        "event_type.event_type_name",
        "location_type.location_type_name"
    )
    .whereNot('events.event_status_id', 3) // Exclude rows where event_status_id = cancelled
    .then(events => {
        res.render('manageEvents', { events });
    })
    .catch(error => {
        console.error('Error querying database: ', error);
        res.status(500).send('Internal Server Error');
    });
});

app.post('/cancelEvent/:event_id', (req, res) => {
    const evtstatus = 3
    // Update the character in the database
    knex('events')
      .where('event_id', parseInt(req.params.event_id))
      .update({
        event_status_id: evtstatus 
      })
      .then(events => {
        res.redirect('/manageEvents'); // Redirect to the list of requests
      })
      .catch(error => {
        console.error('Error updating character:', error);
        res.status(500).send('Internal Server Error');
      });
});

// route to delete volunteer
app.post('/deleteVolunteer/:id', (req, res) => {
    const id = req.params.id;
  
    knex('volunteers')
        .where ('vol_id', id)
        .del()
        .then(() => {
            res.redirect('/manageUsers');
        })
        .catch(error => {
            console.error('Error deleting volunteer:', error);
            res.status(500).send('Internal Server Error');
        });
  });



// render the createEvent page
app.get('/createEvent/:id', (req, res) => {
  let id = req.params.id
  
  // querying data for the chosen request that will become an event
  knex('requests')
  .join('request_status', 'requests.request_status_id', '=', 'request_status.request_status_id')
  .join('event_type', 'requests.req_type_id', '=', 'event_type.event_type_id')
  .where('request_id', id)
  .first()
  .then(request => {
      if (!request) {
          return res.status(404).send('Request not found');
      }

      knex('volunteers')
      .select('vol_first_name', 'vol_last_name', 'vol_id')
      .where('role_id', 1)
      .then(admins => {
          if (admins.length === 0) {
              return res.status(404).send('Administrators not found');
          }

          knex('event_type')
          .select('event_type_id', 'event_type_name')
          .then(types => {
              if (types.length === 0) {
                  return res.status(404).send('Event types not found');
              }

              knex('location_type')
              .select('location_type_id', 'location_type_name')
              .then(locations => {
                  if (locations.length === 0) {
                      return res.status(404).send('Location types not found');
                  }

                  const states = [
                      "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
                      "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
                      "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
                      "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
                      "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
                  ];
      
                  const hours = [];
                  for (let i = 1; i <= 12; i++) {
                      hours.push(i); // Add whole hours
                      if (i < 12) {
                      hours.push(i + 0.5); // Add half hour increments
                  }}
      
                  res.render("createEvent", {request, admins, types, locations, states, hours});
              })

          })
          .catch(error => {
              console.error('Error fetching event types: ', error);
              res.status(500).send('Internal Server Error');
          });
      })
      .catch(error => {
          console.error('Error fetching administrators: ', error);
          res.status(500).send('Internal Server Error');
      });
  })
  .catch(error => {
      console.error('Error fetching request information: ', error);
      res.status(500).send('Internal Server Error');
  });
  // make sure you update event status to approved

});
  
// post to create an event
app.post('/createEvent/:request_id', (req, res) => {
    const request_id = req.params.request_id;

    const event_datetime = req.body.event_datetime;  
    const supervisor_id = req.body.supervisor_id;
    const event_status_id = 1;  
    const event_type_id = req.body.event_type_id;  
    const event_street_1 = req.body.event_street_1;  
    const event_street_2 = req.body.event_street_2 || '';  
    const event_city = req.body.event_city;  
    const event_state = req.body.event_state;  
    const event_zip = req.body.event_zip;  
    const location_type_id = req.body.location_type_id;  
    //const participants = req.body.participants;  
    //const event_duration = req.body.event_duration;  
    //const pockets = req.body.pockets;
    //const collars = req.body.collars;
    //const envelopes = req.body.envelopes;
    //const vests = req.body.vests;
    //const completed_products = req.body.completed_products;
    //const distributed_products =req.body.distributed_products;
    const volunteers_needed = req.body.volunteers_needed;
    const organization_name = req.body.organization_name;
    const notes = req.body.notes;
    
    console.log('Request body:', req.body);
    if (!supervisor_id || isNaN(parseInt(supervisor_id))) {
        return res.status(400).send('Invalid supervisor_id: Please select a valid supervisor.');
    }
  
    knex('requests')
        .where('request_id', request_id)
        .update({
            request_status_id : 2
        })
        .then(() => {
            console.log('request status updated to approved')
        })


    knex('events')
        .insert({
            request_id: request_id,  // Access form data sent via POST
            supervisor_id: supervisor_id,  
            event_status_id : event_status_id,
            event_datetime: event_datetime,  
            event_type_id: event_type_id,  
            event_status_id: event_status_id,  
            event_street_1: event_street_1,  
            event_street_2: event_street_2,  
            event_city: event_city,  
            event_state: event_state,  
            event_zip: event_zip,  
            location_type_id: location_type_id,  
            //participants: participants,  
            //event_duration: event_duration,  
            //pockets: pockets,
            //collars: collars,
            //envelopes: envelopes,
            //vests: vests,
            //completed_products: completed_products,
            //distributed_products:distributed_products,
            volunteers_needed: volunteers_needed,
            organization_name: organization_name,
            notes: notes
        })
        .then(() => {
            console.log('Form submitted successfully!');
            console.log('Request body:', req.body);
            res.redirect('/manageRequests'); 
        })
  
        .catch(error => {
            console.error('Error adding a volunteer:', error);
            console.log('Request body:', req.body);
            res.status(500).send('Internal Server Error while posting');

        });
  });



// render the complete event page
app.get('/completeEvent/:id', (req, res) => {
    let id = req.params.id

    knex('events')
    .join('requests', 'events.request_id', '=', 'requests.request_id')
    .join('volunteers', 'events.supervisor_id', '=', 'volunteers.vol_id')
    .join('event_status', 'events.event_status_id', '=', 'event_status.status_id')
    .join('event_type', 'events.event_type_id', '=', 'event_type.event_type_id')
    .join('location_type', 'events.location_type_id', '=', 'location_type.location_type_id')
    .where('events.event_id', id)
    .first()
    .then(event => {
        if (!event) {
            return res.status(404).send('Event not found');
        }
        const states = [
            "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
            "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
            "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
            "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
            "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
        ];

        const hours = [];
            for (let i = 1; i <= 12; i++) {
                hours.push(i); // Add whole hours
                if (i < 12) {
                hours.push(i + 0.5); // Add half hour increments
            }}
        

        res.render('completeEvent', {event, states, hours})
    })


})

// post to mark event as completed and update stats fields
app.post('/completeEvent/:id', (req, res) => {
    const id = req.params.id;

    //const event_datetime = req.body.event_datetime;  
    //const supervisor_id = req.body.supervisor_id;
    //const event_status_id = 1;  
    //const event_type_id = req.body.event_type_id;  
    //const event_street_1 = req.body.event_street_1;  
    //const event_street_2 = req.body.event_street_2 || '';  
    //const event_city = req.body.event_city;  
    //const event_state = req.body.event_state;  
    //const event_zip = req.body.event_zip;  
    //const location_type_id = req.body.location_type_id;  
    const participants = req.body.participants;  
    const event_duration = req.body.event_duration;  
    const pockets = req.body.pockets;
    const collars = req.body.collars;
    const envelopes = req.body.envelopes;
    const vests = req.body.vests;
    const completed_products = req.body.completed_products;
    const distributed_products = req.body.distributed_products;
    const event_status_id = 2;
    const event_notes = req.body.event_notes;
    //const volunteers_needed = req.body.volunteers_needed;
    //const organization_name = req.body.organization_name;
    
    console.log('Request body:', req.body);
  
    knex('events')
        .where('event_id', id)
        .update({
            participants : participants,
            event_duration : event_duration,
            pockets : pockets,
            collars : collars,
            envelopes : envelopes,
            vests : vests,
            completed_products : completed_products,
            distributed_products : distributed_products,
            event_status_id : event_status_id,
            event_notes : event_notes
        })
        .then(() => {
            console.log('Form submitted successfully!');
            console.log('event updated and marked as completed')
            console.log('Request body:', req.body);
            res.redirect('/manageEvents'); 
        })
        .catch(error => {
            console.error('Error updating event:', error);
            console.log('Request body:', req.body);
            res.status(500).send('Internal Server Error While Updating Event');
        });
  });

// port number, (parameters) => what you want it to do.
app.listen(PORT, () => console.log('Server started on port ' + PORT));
