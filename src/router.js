import React from "react";
import { Router, Route, Switch, Redirect} from "dva/router";
import LoginPage from "./routes/LoginPage";
// import Index from "./routes/Index";

function RouterConfig({ history }) {
  return (
    <Router history={history}>
      <Switch>
        {/* <Redirect exact from="/" to="/general" /> */}
        <Route path="/login" component={LoginPage} />
        {/* <Route path="/general" component={Index} />
        <Route path="/workbench" component={Index} />
        <Route path="/statistics" component={Index} /> */}
        <Redirect to="/login" />
      </Switch>
    </Router>
  );
}

export default RouterConfig;
