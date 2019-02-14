import React, { Component } from "react";
import { Layout, Menu, Avatar } from "antd";
import { Route, NavLink, Switch, Redirect } from "react-router-dom";
import General from "../general";
import Workbench from "../workbench";
import Statistics from "../statistics";
import Timer from "../../components/timer";
import "./index.css";
const { Header, Content, Footer } = Layout;

class Index extends Component {
    state = {
        current: "/general"
    };
    componentDidMount() {
        this.setActiveMenu();
    }
    componentWillReceiveProps(nextPs) {
        if (this.props.match.path !== nextPs.match.path) {
            this.setActiveMenu(nextPs.match.path);
        }
    }

    setActiveMenu = path => {
        path = path || this.props.match.path;
        this.setState({
            current: path
        });
    };

    render() {
        return (
            <Layout className="layout index">
                <Header>
                    <div className="logo"> TODO </div>
                    <Menu
                        theme="dark"
                        mode="horizontal"
                        style={{
                            lineHeight: "64px"
                        }}
                        selectedKeys={[this.state.current]}
                    >
                        <Menu.Item className="px-0" key="/general">
                            <NavLink
                                className="px-4 w-lsm text-center"
                                to="/general"
                                activeClassName="ant-menu-item-selected"
                            >
                                一览
                            </NavLink>
                        </Menu.Item>
                        <Menu.Item className="px-0" key="/workbench">
                            <NavLink
                                className="px-4 w-lsm text-center"
                                to="/workbench"
                                activeClassName="ant-menu-item-selected"
                            >
                                工作台
                            </NavLink>
                        </Menu.Item>
                        <Menu.Item className="px-0" key="/statistics">
                            <NavLink
                                className="px-4 w-lsm text-center"
                                to="/statistics"
                                activeClassName="ant-menu-item-selected"
                            >
                                统计
                            </NavLink>
                        </Menu.Item>
                        <Menu.Item key="5" className="float-right">
                            <Avatar src="http://placeimg.com/60/60/any" />
                        </Menu.Item>
                        <Menu.Item key="4" className="float-right">
                            <Timer />
                        </Menu.Item>
                    </Menu>
                </Header>
                <Content className="content">
                    <Switch>
                        <Route path="/general" component={General} />
                        <Route path="/workbench" component={Workbench} />
                        <Route path="/statistics" component={Statistics} />
                    </Switch>
                </Content>
                <Footer className="footer">
                    TODO© 2018 Created by Zachary Zhou
                    <address>
                        github:
                        <a href="https://github.com/zzy1661/todo">
                            https: //github.com/zzy1661/todo
                        </a>
                    </address>
                </Footer>
            </Layout>
        );
    }
}

export default Index;
