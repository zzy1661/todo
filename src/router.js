import React from "react";
import { Router, Route, Switch, Redirect} from "dva/router";
import LoginPage from "./routes/LoginPage";
import IndexPage from "./routes/IndexPage";

function RouterConfig({ history }) {
  return (
    <Router history={history}>
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/general" component={IndexPage} />
        {/* <Route path="/workbench" component={Index} />
        <Route path="/statistics" component={Index} />  */}
        <Redirect to="/login" />
      </Switch>
    </Router>
  );
}

export default RouterConfig;
